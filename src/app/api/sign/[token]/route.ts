import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getCrew, getProjectName } from '@/lib/crew-db';
import { downloadFromDrive } from '@/lib/drive';
import { buildPlaceholders, generateContractPdf } from '@/lib/contract-pdf';
import { applySignatureToPdf, decodeSignatureDataUrl } from '@/lib/sign-pdf';
import { consumeSignToken, lookupSignToken } from '@/lib/sign-tokens';
import { recordSignedContract } from '@/lib/record-signature';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Accepts a signature drawn on /sign/{token}: stamps it into the contract PDF,
// files the signed copy in the crew member's Drive folder and marks the contract
// signed. No auth — the token IS the authorisation, and it is single-use.

/** Best-effort client IP for the signature attestation line. */
function clientIp(req: Request): string | undefined {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? undefined;
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  let lookup: Awaited<ReturnType<typeof lookupSignToken>>;
  try {
    lookup = await lookupSignToken(params.token);
  } catch (err) {
    console.error('[sign] token lookup failed', err);
    return NextResponse.json(
      { error: 'We cannot reach our records right now. Please try again in a few minutes.' },
      { status: 503 },
    );
  }
  if (!lookup.ok) {
    const message =
      lookup.reason === 'used'
        ? 'This contract has already been signed.'
        : lookup.reason === 'expired'
          ? 'This signing link has expired. Please ask the production for a new one.'
          : 'This signing link is not valid.';
    return NextResponse.json({ error: message, reason: lookup.reason }, { status: 410 });
  }
  const { crewId, type, ref } = lookup.record;

  const body = await req.json().catch(() => null);
  const fullName: string = String(body?.fullName ?? '').trim();
  const agreed = body?.agree === true;
  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ error: 'Please type your full name.' }, { status: 400 });
  }
  if (!agreed) {
    return NextResponse.json(
      { error: 'Please confirm you agree to the contract before signing.' },
      { status: 400 },
    );
  }

  let signaturePng: Buffer;
  try {
    signaturePng = decodeSignatureDataUrl(String(body?.signature ?? ''));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid signature image.' },
      { status: 400 },
    );
  }

  const crew = await getCrew(crewId);
  if (!crew) return NextResponse.json({ error: 'crew not found' }, { status: 404 });

  try {
    // 1. The exact PDF we emailed (falling back to a fresh render).
    const fileId = type === 'X' ? crew.contract.pdfFileIdX : crew.contract.pdfFileIdY;
    let pdfBytes: Uint8Array | null = null;
    if (fileId) {
      try {
        pdfBytes = await downloadFromDrive(fileId);
      } catch (err) {
        console.error('[sign] Drive fetch failed, regenerating', err);
      }
    }
    if (!pdfBytes) {
      const projectName = await getProjectName(crew.projectId);
      pdfBytes = await generateContractPdf({
        placeholders: buildPlaceholders(crew, type, projectName),
      });
    }

    // 2. Draw the signature in.
    const signedAt = Date.now();
    const signed = await applySignatureToPdf({
      pdfBytes,
      signaturePng,
      signature: {
        signerName: fullName,
        signedAt,
        ip: clientIp(req),
        reference: ref,
      },
    });

    // 3. Burn the token before filing, so a double-tap on a flaky phone
    //    connection cannot file the contract twice.
    const burned = await consumeSignToken(params.token);
    if (!burned) {
      return NextResponse.json(
        { error: 'This contract has already been signed.', reason: 'used' },
        { status: 410 },
      );
    }

    try {
      const filed = await recordSignedContract({
        crew,
        type,
        pdfBytes: signed,
        method: 'online',
        actor: 'crew',
        signerName: fullName,
        signerIp: clientIp(req),
        receivedFrom: crew.personal.email,
        reference: ref,
      });
      return NextResponse.json({ ok: true, driveLink: filed.driveLink });
    } catch (err) {
      // Filing failed after the token was burned — hand it back so the crew
      // member can simply tap sign again.
      await adminDb()
        .ref(`signTokens/${params.token}`)
        .update({ used: false, usedAt: null })
        .catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error('[sign] error', err);
    await logAudit({
      action: 'contract_sign_failed',
      actor: 'crew',
      crewId,
      detail: err instanceof Error ? err.message : 'unknown error',
    });
    return NextResponse.json(
      { error: 'We could not save your signature. Please try again in a moment.' },
      { status: 500 },
    );
  }
}

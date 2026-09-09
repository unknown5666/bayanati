import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { getCrew, getProjectName, updateContract } from '@/lib/crew-db';
import { buildPlaceholders, generateContractPdf, formatAed } from '@/lib/contract-pdf';
import { uploadToDrive } from '@/lib/drive';
import { createSignToken, revokeSignToken, signUrlFor } from '@/lib/sign-tokens';
import { sendContractEmail } from '@/lib/email';
import { logAudit } from '@/lib/audit';
import type { ContractType } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // PDF + Drive + email can take a few seconds

// Admin-only. Every PDF is bilingual (English | Arabic). Body:
//   mode:  'generate' — build the selected PDFs, store in Drive, return links.
//          'send'     — additionally email EACH selected contract SEPARATELY,
//                       with the PDF attached and a one-time signing link.
//   types: ['X'] | ['Y'] | ['X','Y']  — which contracts to act on (default both).
//
// Signing is self-hosted: each sent contract gets a token (behind /sign/{token})
// and a short reference printed in the subject, so a crew member can either sign
// on their phone or reply with a scan — see src/lib/sign-tokens.ts.

const LETTER: Record<ContractType, 'A' | 'B'> = { X: 'A', Y: 'B' };

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin(req.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const crewId: string | undefined = body?.crewId;
  const mode: 'generate' | 'send' = body?.mode === 'generate' ? 'generate' : 'send';
  if (!crewId) return NextResponse.json({ error: 'crewId required' }, { status: 400 });

  // Which contracts to act on. Accept ['X'|'Y'] in any order; default to both.
  const requested: unknown = body?.types;
  let types: ContractType[] =
    Array.isArray(requested)
      ? (requested.filter((t) => t === 'X' || t === 'Y') as ContractType[])
      : ['X', 'Y'];
  types = types.filter((t, i) => types.indexOf(t) === i); // de-dupe
  if (types.length === 0) types = ['X', 'Y'];

  const crew = await getCrew(crewId);
  if (!crew) return NextResponse.json({ error: 'crew not found' }, { status: 404 });

  // Validate the inputs needed for the SELECTED contracts.
  const c = crew.contract;
  const missing: string[] = [];
  if (!c.role) missing.push('role');
  if (!c.dateFrom) missing.push('dateFrom');
  if (!c.dateTo) missing.push('dateTo');
  if (!c.iban) missing.push('iban');
  if (types.includes('X') && c.amountX == null) missing.push('amountX');
  if (types.includes('Y') && c.amountY == null) missing.push('amountY');
  if (mode === 'send' && !crew.personal.email) missing.push('email');
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 },
    );
  }

  const projectName = await getProjectName(crew.projectId);
  const crewName = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();

  try {
    const pdfLinks: Partial<Record<ContractType, string>> = {};
    const signLinks: Partial<Record<ContractType, string>> = {};
    const updates: Record<string, unknown> = { generatedAt: Date.now() };

    for (const type of types) {
      const placeholders = buildPlaceholders(crew, type, projectName);
      const pdf = await generateContractPdf({ placeholders });
      const fileName = `Contract - ${crew.personal.firstName} - ${crew.personal.lastName} - ${LETTER[type]}.pdf`;

      const up = await uploadToDrive({
        pathSegments: ['Projects', projectName, 'Contracts', 'Pending', crewName],
        fileName,
        mimeType: 'application/pdf',
        data: pdf,
      });
      pdfLinks[type] = up.webViewLink;
      updates[type === 'X' ? 'pdfLinkX' : 'pdfLinkY'] = up.webViewLink;
      updates[type === 'X' ? 'pdfFileIdX' : 'pdfFileIdY'] = up.fileId;

      if (mode === 'send') {
        // Re-sending supersedes the previous link: burn the old token so only
        // the newest email can be used to sign.
        await revokeSignToken(type === 'X' ? c.signTokenX : c.signTokenY);
        const token = await createSignToken({ crewId, type });
        const signUrl = signUrlFor(token.token);
        signLinks[type] = signUrl;

        updates[type === 'X' ? 'signTokenX' : 'signTokenY'] = token.token;
        updates[type === 'X' ? 'signRefX' : 'signRefY'] = token.ref;
        updates[type === 'X' ? 'signUrlX' : 'signUrlY'] = signUrl;

        // A SEPARATE email per contract, each with its own PDF and reference.
        await sendContractEmail({
          to: crew.personal.email,
          crewName: placeholders.CREW_NAME,
          projectName,
          role: c.role!,
          dateFrom: c.dateFrom!,
          dateTo: c.dateTo!,
          amount: formatAed(type === 'X' ? c.amountX : c.amountY),
          contractLabel: LETTER[type],
          reference: token.ref,
          signUrl,
          pdf: { filename: fileName, content: pdf },
        });
      }
    }

    if (mode === 'send') {
      updates.status = 'sent';
      updates.sentAt = Date.now();
    } else if (c.status === 'submitted') {
      updates.status = 'pending';
    }
    await updateContract(crewId, updates);

    await logAudit({
      action: mode === 'send' ? 'contracts_sent' : 'contracts_generated',
      actor: admin.email,
      crewId,
      projectId: crew.projectId,
      detail:
        mode === 'send'
          ? `Emailed ${types.map((t) => LETTER[t]).join(', ')} (PDF attached) → ${crew.personal.email}`
          : `Generated ${types.map((t) => LETTER[t]).join(', ')} for review (not sent)`,
    });

    return NextResponse.json({ ok: true, mode, types, links: pdfLinks, signLinks });
  } catch (err) {
    console.error('[contracts/generate] error', err);
    await logAudit({
      action: mode === 'generate' ? 'contracts_generate_failed' : 'contracts_send_failed',
      actor: admin.email,
      crewId,
      detail: err instanceof Error ? err.message : 'unknown error',
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Contract generation failed' },
      { status: 500 },
    );
  }
}

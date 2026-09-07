import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { downloadSubmissionPdf } from '@/lib/docuseal';
import { uploadToDrive } from '@/lib/drive';
import { getCrew, getProjectName, deriveStatus } from '@/lib/crew-db';
import { logAudit } from '@/lib/audit';
import type { ContractType } from '@/lib/types';

export const runtime = 'nodejs';

// Docuseal webhook: fires when a submitter completes a form. We verify a shared
// secret (configured as a custom header in Docuseal), download the signed PDF,
// store it in Drive, and update the crew's signature status.
//
// Configure in Docuseal → Settings → Webhooks:
//   URL:    {APP_URL}/api/webhook/docuseal
//   Header: X-Webhook-Secret: {DOCUSEAL_WEBHOOK_SECRET}

const COMPLETED_EVENTS = new Set(['form.completed', 'submission.completed']);

export async function POST(req: Request) {
  // 1. Verify the shared secret.
  const expected = process.env.DOCUSEAL_WEBHOOK_SECRET;
  const provided =
    req.headers.get('x-webhook-secret') ??
    req.headers.get('x-docuseal-signature') ??
    '';
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const eventType: string = payload?.event_type ?? '';
  if (!COMPLETED_EVENTS.has(eventType)) {
    // Acknowledge non-completion events without acting.
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const submissionId: number | undefined =
    payload?.data?.submission_id ?? payload?.data?.id;
  if (!submissionId) {
    return NextResponse.json({ error: 'no submission id' }, { status: 400 });
  }

  try {
    // 2. Resolve crew + contract type from the index.
    const idxSnap = await adminDb().ref(`docusealIndex/${submissionId}`).get();
    if (!idxSnap.exists()) {
      return NextResponse.json({ ok: true, ignored: 'unknown submission' });
    }
    const { crewId, type } = idxSnap.val() as { crewId: string; type: ContractType };

    const crew = await getCrew(crewId);
    if (!crew) return NextResponse.json({ error: 'crew not found' }, { status: 404 });

    // 3. Download the signed PDF and store it under Drive/Signed.
    const projectName = await getProjectName(crew.projectId);
    const crewName = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();
    const signedPdf = await downloadSubmissionPdf(submissionId);
    const upload = await uploadToDrive({
      pathSegments: ['Projects', projectName, 'Contracts', 'Signed', crewName],
      fileName: `contract_${type}_signed.pdf`,
      mimeType: 'application/pdf',
      data: signedPdf,
    });

    // 4. Update the signature record + overall status.
    const key = type === 'X' ? 'contractX' : 'contractY';
    await adminDb().ref(`crew/${crewId}/signatures/${key}`).set({
      signed: true,
      timestamp: Date.now(),
      driveLink: upload.webViewLink,
    });

    const otherSigned =
      type === 'X'
        ? crew.signatures.contractY.signed
        : crew.signatures.contractX.signed;
    const signedX = type === 'X' ? true : crew.signatures.contractX.signed;
    const signedY = type === 'Y' ? true : crew.signatures.contractY.signed;

    const status = deriveStatus(signedX, signedY, crew.contract.status);
    await adminDb().ref(`crew/${crewId}/contract`).update({ status });
    await adminDb().ref(`crew/${crewId}`).update({ updatedAt: Date.now() });

    await logAudit({
      action: otherSigned ? 'contract_both_signed' : `contract_${type}_signed`,
      actor: 'crew',
      crewId,
      projectId: crew.projectId,
      detail: `Signed contract ${type}; stored at ${upload.webViewLink}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook/docuseal] error', err);
    await logAudit({
      action: 'contract_sign_processing_failed',
      actor: 'system',
      detail: err instanceof Error ? err.message : 'unknown error',
    });
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}

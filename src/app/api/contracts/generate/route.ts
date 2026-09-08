import { NextResponse } from 'next/server';
import { adminDb, requireAdmin } from '@/lib/firebase/admin';
import { getCrew, getProjectName, updateContract } from '@/lib/crew-db';
import { buildPlaceholders, generateContractPdf } from '@/lib/contract-pdf';
import { uploadToDrive } from '@/lib/drive';
import { createSubmission, createTemplateFromPdf } from '@/lib/docuseal';
import { sendContractEmail } from '@/lib/email';
import { logAudit } from '@/lib/audit';
import { formatAed } from '@/lib/contract-pdf';
import type { ContractType } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // PDF + Docuseal + email can take a few seconds

// Admin-only: generate contract X and Y and store them in Drive. Two modes:
//   mode='generate' — build the PDFs and return Drive view links only, so the
//                     admin can review the contracts WITHOUT sending anything.
//   mode='send'     — additionally create Docuseal signing requests and email
//                     the crew member both links (the original behaviour).

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

  const crew = await getCrew(crewId);
  if (!crew) return NextResponse.json({ error: 'crew not found' }, { status: 404 });

  // 1. Validate all contract inputs are set.
  const c = crew.contract;
  const missing: string[] = [];
  if (!c.role) missing.push('role');
  if (c.amountX == null) missing.push('amountX');
  if (c.amountY == null) missing.push('amountY');
  if (!c.dateFrom) missing.push('dateFrom');
  if (!c.dateTo) missing.push('dateTo');
  if (!c.iban) missing.push('iban');
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 },
    );
  }

  const projectName = await getProjectName(crew.projectId);
  const crewName = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();
  const lang = c.language;

  try {
    // Build both PDFs and store them in Drive under Pending. This happens in
    // BOTH modes — 'generate' stops here, 'send' continues to Docuseal + email.
    const pdfs: Partial<Record<ContractType, Awaited<ReturnType<typeof generateContractPdf>>>> = {};
    const pdfLinks: Partial<Record<ContractType, string>> = {};

    for (const type of ['X', 'Y'] as ContractType[]) {
      const placeholders = buildPlaceholders(crew, type, projectName);
      const pdf = await generateContractPdf({ lang, type, placeholders });
      pdfs[type] = pdf;

      const up = await uploadToDrive({
        pathSegments: ['Projects', projectName, 'Contracts', 'Pending', crewName],
        fileName: `contract_${type}.pdf`,
        mimeType: 'application/pdf',
        data: pdf,
      });
      pdfLinks[type] = up.webViewLink;
    }

    // GENERATE-ONLY: persist the PDF links and stop. Nothing is sent. We bump a
    // fresh 'submitted' record to 'pending' (prep started) but never downgrade a
    // record that has already been sent/signed.
    if (mode === 'generate') {
      await updateContract(crewId, {
        pdfLinkX: pdfLinks.X!,
        pdfLinkY: pdfLinks.Y!,
        generatedAt: Date.now(),
        ...(c.status === 'submitted' ? { status: 'pending' as const } : {}),
      });

      await logAudit({
        action: 'contracts_generated',
        actor: admin.email,
        crewId,
        projectId: crew.projectId,
        detail: `Generated contract PDFs for review (not sent)`,
      });

      return NextResponse.json({ ok: true, mode: 'generate', links: pdfLinks });
    }

    // SEND: create Docuseal templates + submissions from the PDFs we just built.
    const results: Partial<Record<ContractType, { signUrl: string; submissionId: number }>> = {};
    for (const type of ['X', 'Y'] as ContractType[]) {
      const { templateId } = await createTemplateFromPdf({
        name: `${crewName} — Contract ${type} (${projectName})`,
        pdf: pdfs[type]!,
      });
      const submission = await createSubmission({
        templateId,
        email: crew.personal.email,
        name: crewName,
      });
      results[type] = { signUrl: submission.signUrl, submissionId: submission.submissionId };

      // Index the submission so the webhook can resolve crew + type on signing.
      await adminDb()
        .ref(`docusealIndex/${submission.submissionId}`)
        .set({ crewId, type });
    }

    // Email the crew both links.
    await sendContractEmail({
      to: crew.personal.email,
      lang,
      crewName,
      projectName,
      role: c.role!,
      dateFrom: c.dateFrom!,
      dateTo: c.dateTo!,
      amountX: formatAed(c.amountX),
      amountY: formatAed(c.amountY),
      signUrlX: results.X!.signUrl,
      signUrlY: results.Y!.signUrl,
    });

    // Persist status + PDF links + Docuseal references.
    await updateContract(crewId, {
      status: 'sent',
      sentAt: Date.now(),
      generatedAt: Date.now(),
      pdfLinkX: pdfLinks.X!,
      pdfLinkY: pdfLinks.Y!,
      docusealSubmissionX: results.X!.submissionId,
      docusealSubmissionY: results.Y!.submissionId,
      signUrlX: results.X!.signUrl,
      signUrlY: results.Y!.signUrl,
    });

    await logAudit({
      action: 'contracts_sent',
      actor: admin.email,
      crewId,
      projectId: crew.projectId,
      detail: `X=${formatAed(c.amountX)} Y=${formatAed(c.amountY)} → ${crew.personal.email}`,
    });

    return NextResponse.json({ ok: true, mode: 'send', links: pdfLinks });
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

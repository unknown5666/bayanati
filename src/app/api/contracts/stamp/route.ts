import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { getCrew, getProjectName, updateContract } from '@/lib/crew-db';
import { downloadFromDrive, uploadToDrive } from '@/lib/drive';
import { applyStampToPdf, loadStampPng } from '@/lib/stamp';
import { logAudit } from '@/lib/audit';
import type { ContractType } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Admin-only: apply the company stamp to the SIGNED contract PDFs of one or
// more crew members. Accepts { crewId } or { crewIds: [...] } (for bulk). For
// each crew, every already-signed contract (X→A, Y→B) is fetched back from
// Drive, stamped bottom-left, and re-uploaded under Signed/.

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin(req.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const crewIds: string[] = Array.isArray(body?.crewIds)
    ? body.crewIds.filter((x: unknown): x is string => typeof x === 'string')
    : typeof body?.crewId === 'string'
      ? [body.crewId]
      : [];
  if (!crewIds.length) {
    return NextResponse.json({ error: 'crewId or crewIds required' }, { status: 400 });
  }

  // Load the stamp once — fail fast with a clear message if it's not present.
  let stampPng: Uint8Array;
  try {
    stampPng = await loadStampPng();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'stamp image missing' },
      { status: 400 },
    );
  }

  const results: Array<{
    crewId: string;
    ok: boolean;
    stamped?: number;
    links?: Partial<Record<ContractType, string>>;
    error?: string;
  }> = [];

  for (const crewId of crewIds) {
    try {
      const crew = await getCrew(crewId);
      if (!crew) {
        results.push({ crewId, ok: false, error: 'crew not found' });
        continue;
      }

      const projectName = await getProjectName(crew.projectId);
      const first = crew.personal.firstName;
      const last = crew.personal.lastName;
      const crewName = `${first} ${last}`.trim();

      const links: Partial<Record<ContractType, string>> = {};
      let stampedCount = 0;

      for (const type of ['X', 'Y'] as ContractType[]) {
        const signature =
          type === 'X' ? crew.signatures?.contractX : crew.signatures?.contractY;
        // The signed copy filed in Drive — by whichever route it was signed.
        if (!signature?.signed || !signature.driveFileId) continue;

        const signedPdf = await downloadFromDrive(signature.driveFileId);
        const stamped = await applyStampToPdf(new Uint8Array(signedPdf), stampPng);
        const letter = type === 'X' ? 'A' : 'B';
        const up = await uploadToDrive({
          pathSegments: ['Projects', projectName, 'Contracts', 'Signed', crewName],
          fileName: `Contract - ${first} - ${last} - ${letter} - stamped.pdf`,
          mimeType: 'application/pdf',
          data: stamped,
        });
        links[type] = up.webViewLink;
        stampedCount++;
      }

      if (stampedCount === 0) {
        results.push({
          crewId,
          ok: false,
          error: 'no signed contract on file to stamp',
        });
        continue;
      }

      await updateContract(crewId, {
        ...(links.X ? { stampLinkX: links.X } : {}),
        ...(links.Y ? { stampLinkY: links.Y } : {}),
        stampedAt: Date.now(),
      });

      await logAudit({
        action: 'contracts_stamped',
        actor: admin.email,
        crewId,
        projectId: crew.projectId,
        detail: `Applied company stamp to ${stampedCount} signed contract(s)`,
      });

      results.push({ crewId, ok: true, stamped: stampedCount, links });
    } catch (err) {
      results.push({
        crewId,
        ok: false,
        error: err instanceof Error ? err.message : 'stamping failed',
      });
    }
  }

  const anyOk = results.some((r) => r.ok);
  return NextResponse.json({ ok: anyOk, results }, { status: anyOk ? 200 : 400 });
}

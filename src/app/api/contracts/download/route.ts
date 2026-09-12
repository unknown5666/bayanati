import { requireAdmin } from '@/lib/firebase/admin';
import { getCrew, getProjectName } from '@/lib/crew-db';
import { buildPlaceholders, generateContractPdf } from '@/lib/contract-pdf';
import { downloadFromDrive, driveFileIdFromLink } from '@/lib/drive';
import { createZip, zipSafe, type ZipEntry } from '@/lib/zip';
import { logAudit } from '@/lib/audit';
import { LETTER, normaliseTypes } from '@/lib/contract-run';
import type { ContractType } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Admin-only bulk download. Body:
//   { crewIds: string[], types?: ('X'|'Y')[], kind?: 'contract' | 'signed' }
//
// 'contract' (default) renders each selected contract fresh from the crew's
// current data — no Drive round trip, and never a stale copy. 'signed' pulls
// the stamped/signed PDFs back out of Drive.
//
// Responds with a ZIP: one folder per crew member. A crew member that cannot
// be produced is skipped and listed in the X-Skipped header rather than
// failing the whole download.

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin(req.headers.get('authorization'));
  } catch {
    return json({ error: 'unauthorized' }, 401);
  }

  const body = await req.json().catch(() => null);
  const crewIds: string[] = Array.isArray(body?.crewIds)
    ? body.crewIds.filter((x: unknown): x is string => typeof x === 'string')
    : [];
  if (!crewIds.length) return json({ error: 'crewIds required' }, 400);
  if (crewIds.length > 200) return json({ error: 'Too many crew selected (max 200)' }, 400);

  const types = normaliseTypes(body?.types);
  const kind: 'contract' | 'signed' = body?.kind === 'signed' ? 'signed' : 'contract';

  const entries: ZipEntry[] = [];
  const skipped: string[] = [];

  for (const crewId of crewIds) {
    try {
      const crew = await getCrew(crewId);
      if (!crew) {
        skipped.push(`${crewId}: not found`);
        continue;
      }
      const name = `${crew.personal.firstName} ${crew.personal.lastName}`.trim() || crewId;
      const folder = zipSafe(name);

      if (kind === 'contract') {
        const projectName = await getProjectName(crew.projectId);
        let produced = 0;
        for (const type of types) {
          const amount = type === 'X' ? crew.contract.amountX : crew.contract.amountY;
          if (!crew.contract.role || amount == null) continue; // nothing to render yet
          const pdf = await generateContractPdf({
            placeholders: buildPlaceholders(crew, type, projectName),
          });
          entries.push({
            name: `${folder}/Contract - ${folder} - ${LETTER[type]}.pdf`,
            data: Buffer.from(pdf),
          });
          produced++;
        }
        if (!produced) skipped.push(`${name}: role/amount not set`);
      } else {
        let produced = 0;
        for (const type of types as ContractType[]) {
          const signature =
            type === 'X' ? crew.signatures?.contractX : crew.signatures?.contractY;
          // Prefer the stamped copy; fall back to the raw signed one. Only the
          // stamped link is a URL, so its file id has to be parsed back out.
          const stampLink =
            type === 'X' ? crew.contract.stampLinkX : crew.contract.stampLinkY;
          const fileId =
            driveFileIdFromLink(stampLink) ??
            (signature?.signed ? (signature.driveFileId ?? null) : null);
          if (!fileId) continue;
          const data = await downloadFromDrive(fileId);
          entries.push({
            name: `${folder}/Contract - ${folder} - ${LETTER[type]} - signed.pdf`,
            data,
          });
          produced++;
        }
        if (!produced) skipped.push(`${name}: no signed contract yet`);
      }
    } catch (err) {
      skipped.push(`${crewId}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  if (!entries.length) {
    return json(
      { error: `Nothing to download. ${skipped.slice(0, 5).join('; ')}` },
      400,
    );
  }

  const zip = createZip(entries);
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `OEP contracts ${stamp}.zip`;

  await logAudit({
    action: 'contracts_bulk_downloaded',
    actor: admin.email,
    detail: `${entries.length} PDF(s) for ${crewIds.length} crew (${kind})`,
  });

  // Wrapped in a Blob: the Web Response body type does not accept a raw Buffer.
  const bytes = new Uint8Array(zip.length);
  bytes.set(zip);
  const zipBody = new Blob([bytes], { type: 'application/zip' });
  return new Response(zipBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(zip.length),
      'X-Skipped': encodeURIComponent(skipped.join(' | ')).slice(0, 2000),
      'X-File-Count': String(entries.length),
    },
  });
}

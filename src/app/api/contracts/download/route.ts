import { requireAdmin } from '@/lib/firebase/admin';
import { getCrew, getProjectName } from '@/lib/crew-db';
import { buildPlaceholders, generateContractPdf } from '@/lib/contract-pdf';
import { downloadFromDrive, driveFileIdFromLink } from '@/lib/drive';
import { createZip, zipSafe, type ZipEntry } from '@/lib/zip';
import { logAudit } from '@/lib/audit';
import {
  ATTACHMENT_KEYS,
  appendAttachments,
  mergePdfs,
  type AttachmentKey,
} from '@/lib/contract-attach';
import { LETTER, normaliseTypes } from '@/lib/contract-run';
import { loadStampPng } from '@/lib/stamp';
import { stampSignedContracts } from '@/lib/stamp-run';
import type { ContractType } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Admin-only bulk download. Body:
//   { crewIds: string[], types?: ('X'|'Y')[], kind?: 'contract' | 'signed' | 'stamped',
//     stampMissing?: 'save' | 'apply' | 'skip' }
//
// 'contract' (default) renders each selected contract fresh from the crew's
// current data — no Drive round trip, and never a stale copy. 'signed' pulls
// the signed PDFs back out of Drive; 'stamped' pulls the stamped ones, and
// stamps any signed-but-unstamped copy on the spot unless told to skip it.
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
  const kind: 'contract' | 'signed' | 'stamped' =
    body?.kind === 'signed' || body?.kind === 'stamped' ? body.kind : 'contract';
  // For 'stamped': what to do with signed contracts that have no stamp yet —
  // stamp them for this download only, stamp and file them in Drive, or skip.
  const stampMissing: 'apply' | 'save' | 'skip' =
    body?.stampMissing === 'apply' || body?.stampMissing === 'skip' ? body.stampMissing : 'save';
  let stampPng: Uint8Array | undefined;
  let stampedNow = 0;

  const attach: AttachmentKey[] = Array.isArray(body?.attach)
    ? ATTACHMENT_KEYS.filter((k) => body.attach.includes(k))
    : [];
  const format: 'zip' | 'pdf' = body?.format === 'pdf' ? 'pdf' : 'zip';

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

      // ID scans are fetched once per person and appended to each contract.
      const scans: Uint8Array[] = [];
      for (const k of attach) {
        const link =
          k === 'eidFront'
            ? crew.documents.emiratesIdFront
            : k === 'eidBack'
              ? crew.documents.emiratesIdBack
              : crew.documents.passportImage;
        const id = driveFileIdFromLink(link);
        if (id) scans.push(new Uint8Array(await downloadFromDrive(id)));
        else skipped.push(`${name}: no ${k} on file`);
      }
      const withScans = async (pdf: Uint8Array) => Buffer.from(await appendAttachments(pdf, scans));

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
            data: await withScans(pdf),
          });
          produced++;
        }
        if (!produced) skipped.push(`${name}: role/amount not set`);
      } else if (kind === 'signed') {
        let produced = 0;
        for (const type of types as ContractType[]) {
          const signature =
            type === 'X' ? crew.signatures?.contractX : crew.signatures?.contractY;
          // The signed copy exactly as the crew member returned it. Older
          // records may only have the stamped link, so fall back to that.
          const stampLink =
            type === 'X' ? crew.contract.stampLinkX : crew.contract.stampLinkY;
          const fileId =
            (signature?.signed ? (signature.driveFileId ?? null) : null) ??
            driveFileIdFromLink(stampLink);
          if (!fileId) continue;
          const data = await downloadFromDrive(fileId);
          entries.push({
            name: `${folder}/Contract - ${folder} - ${LETTER[type]} - signed.pdf`,
            data: await withScans(new Uint8Array(data)),
          });
          produced++;
        }
        if (!produced) skipped.push(`${name}: no signed contract yet`);
      } else {
        let produced = 0;
        const missing: ContractType[] = [];
        for (const type of types as ContractType[]) {
          const stampLink =
            type === 'X' ? crew.contract.stampLinkX : crew.contract.stampLinkY;
          const fileId = driveFileIdFromLink(stampLink);
          if (!fileId) {
            missing.push(type);
            continue;
          }
          const data = await downloadFromDrive(fileId);
          entries.push({
            name: `${folder}/Contract - ${folder} - ${LETTER[type]} - stamped.pdf`,
            data: await withScans(new Uint8Array(data)),
          });
          produced++;
        }

        if (missing.length && stampMissing !== 'skip') {
          stampPng ??= await loadStampPng();
          const copies = await stampSignedContracts(crewId, crew, missing, stampPng, {
            save: stampMissing === 'save',
          });
          for (const type of missing) {
            const copy = copies[type];
            if (!copy) continue;
            entries.push({
              name: `${folder}/Contract - ${folder} - ${LETTER[type]} - stamped.pdf`,
              data: await withScans(copy.pdf),
            });
            produced++;
            stampedNow++;
          }
        }
        if (!produced) {
          skipped.push(
            `${name}: ${stampMissing === 'skip' && missing.length ? 'not stamped yet' : 'no signed contract yet'}`,
          );
        }
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

  const stamp = new Date().toISOString().slice(0, 10);
  const single = crewIds.length === 1 ? entries[0].name.split('/')[0] : `OEP contracts ${stamp}`;
  const asPdf = format === 'pdf';
  const zip = asPdf
    ? Buffer.from(await mergePdfs(entries.map((e) => new Uint8Array(e.data))))
    : createZip(entries);
  const fileName = `${single}.${asPdf ? 'pdf' : 'zip'}`;
  const mime = asPdf ? 'application/pdf' : 'application/zip';

  await logAudit({
    action: 'contracts_bulk_downloaded',
    actor: admin.email,
    detail:
      `${entries.length} PDF(s) for ${crewIds.length} crew (${kind})` +
      (stampedNow ? `, stamped ${stampedNow} now${stampMissing === 'save' ? ' and filed' : ''}` : ''),
  });

  // Wrapped in a Blob: the Web Response body type does not accept a raw Buffer.
  const bytes = new Uint8Array(zip.length);
  bytes.set(zip);
  const zipBody = new Blob([bytes], { type: mime });
  return new Response(zipBody, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(zip.length),
      'X-Skipped': encodeURIComponent(skipped.join(' | ')).slice(0, 2000),
      'X-File-Count': String(entries.length),
      'X-Stamped-Now': String(stampedNow),
    },
  });
}

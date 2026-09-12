import { NextResponse } from 'next/server';
import { adminDb, requireAdmin } from '@/lib/firebase/admin';
import {
  ensureProjectByName,
  getCrew,
  getProjectName,
  updateContract,
  updateCrew,
  INTAKE_PROJECT_NAME,
} from '@/lib/crew-db';
import { resolveCrewFolder } from '@/lib/drive';
import { logAudit } from '@/lib/audit';
import { validateIban } from '@/lib/validation';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Admin-only bulk edit. Body:
//   { crewIds: string[], patch: { projectName?, role?, dateFrom?, dateTo?,
//                                 amountX?, amountY?, iban? } }
//
// ONLY the keys present in the patch are written, as targeted child updates —
// every other field on the crew member (IBAN, amounts, documents, signatures,
// generated PDFs) is left exactly as it was.
//
// Setting `projectName` also moves each crew member's Google Drive folder under
// that project so the Drive tree matches the dashboard. That move is several
// Drive round trips per person, which is slow and can fail on its own (an
// expired refresh token, a Drive outage). It is therefore best-effort and runs
// AFTER the database write: the project assignment always lands, and a Drive
// problem is reported per crew member rather than losing the edit.
//
// Callers should send crew in small batches (see bulkUpdateCrew in
// lib/api-client) so no single request outlives a proxy's idle timeout.

interface BulkPatch {
  projectName?: string;
  role?: string;
  dateFrom?: string;
  dateTo?: string;
  amountX?: number;
  amountY?: number;
  iban?: string;
}

/** Give up on a slow Drive call rather than letting the request hang. */
const DRIVE_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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
    : [];
  const patch: BulkPatch = body?.patch ?? {};
  if (!crewIds.length) return bad('crewIds required');
  if (crewIds.length > 200) return bad('Too many crew selected (max 200)');

  // Shared contract fields. A blank value means "leave this one alone", so it
  // never reaches the patch.
  const contractPatch: Record<string, unknown> = {};
  if (patch.role !== undefined && String(patch.role).trim()) {
    contractPatch.role = String(patch.role).trim().slice(0, 120);
  }
  if (patch.dateFrom !== undefined && String(patch.dateFrom).trim()) {
    contractPatch.dateFrom = String(patch.dateFrom).trim();
  }
  if (patch.dateTo !== undefined && String(patch.dateTo).trim()) {
    contractPatch.dateTo = String(patch.dateTo).trim();
  }
  if (patch.amountX !== undefined && patch.amountX !== null) {
    if (!(Number(patch.amountX) >= 0)) return bad('amountX must be a positive number');
    contractPatch.amountX = Number(patch.amountX);
  }
  if (patch.amountY !== undefined && patch.amountY !== null) {
    if (!(Number(patch.amountY) >= 0)) return bad('amountY must be a positive number');
    contractPatch.amountY = Number(patch.amountY);
  }
  if (patch.iban !== undefined && String(patch.iban).trim()) {
    const check = validateIban(patch.iban);
    if (!check.ok) return bad(check.message ?? 'invalid IBAN');
    contractPatch.iban = String(patch.iban).replace(/\s/g, '').toUpperCase();
  }

  const projectName = patch.projectName?.trim();
  let projectId: string | null = null;
  if (projectName) {
    try {
      projectId = await ensureProjectByName(projectName);
    } catch (err) {
      return bad(err instanceof Error ? err.message : 'invalid project name');
    }
  }

  if (!projectId && !Object.keys(contractPatch).length) {
    return bad('Nothing to update — set a project name or at least one field');
  }

  const results: Array<{
    crewId: string;
    name: string;
    ok: boolean;
    error?: string;
    driveError?: string;
  }> = [];
  let driveFailures = 0;

  for (const crewId of crewIds) {
    let name = crewId;
    try {
      const crew = await getCrew(crewId);
      if (!crew) {
        results.push({ crewId, name, ok: false, error: 'not found' });
        continue;
      }
      name = `${crew.personal.firstName} ${crew.personal.lastName}`.trim() || crewId;

      const previousProjectName = projectId ? await getProjectName(crew.projectId) : null;

      // The database write comes first and is the one that must not fail.
      if (Object.keys(contractPatch).length) await updateContract(crewId, contractPatch);
      if (projectId) await updateCrew(crewId, { projectId });

      // Drive second, best-effort: the edit is already saved either way.
      let driveError: string | undefined;
      if (projectId && projectName) {
        try {
          const folders = await withTimeout(
            resolveCrewFolder({
              projectName,
              crewName: name,
              legacyProjectNames: [previousProjectName, INTAKE_PROJECT_NAME].filter(
                (p): p is string => Boolean(p),
              ),
            }),
            DRIVE_TIMEOUT_MS,
            'Drive folder move',
          );
          await adminDb()
            .ref(`crew/${crewId}/documents`)
            .update({ driveFolder: folders.webViewLink });
        } catch (err) {
          driveFailures++;
          driveError = err instanceof Error ? err.message : 'Drive move failed';
          console.error('[crew/bulk-update] Drive move failed for', crewId, err);
        }
      }

      results.push({ crewId, name, ok: true, driveError });
    } catch (err) {
      results.push({
        crewId,
        name,
        ok: false,
        error: err instanceof Error ? err.message : 'failed',
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  await logAudit({
    action: 'crew_bulk_updated',
    actor: admin.email,
    projectId: projectId ?? undefined,
    detail:
      `${okCount}/${crewIds.length} crew · ` +
      [projectName ? `project="${projectName}"` : null, ...Object.keys(contractPatch)]
        .filter(Boolean)
        .join(', ') +
      (driveFailures ? ` · ${driveFailures} Drive folder move(s) failed` : ''),
  });

  return NextResponse.json({ ok: okCount > 0, driveFailures, results });
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

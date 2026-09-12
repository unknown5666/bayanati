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
export const maxDuration = 300; // Drive folder moves are one round trip per crew

// Admin-only bulk edit. Body:
//   { crewIds: string[], patch: { projectName?, role?, dateFrom?, dateTo?,
//                                 amountX?, amountY?, iban? } }
//
// Setting `projectName` creates the project if needed, reassigns every selected
// crew member to it, AND moves each one's Google Drive folder under that
// project — so the Drive tree matches what the dashboard says. Only the keys
// present in the patch are written; everything else is left alone.

interface BulkPatch {
  projectName?: string;
  role?: string;
  dateFrom?: string;
  dateTo?: string;
  amountX?: number;
  amountY?: number;
  iban?: string;
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

  // Shared contract fields.
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

  const results: Array<{ crewId: string; name: string; ok: boolean; error?: string }> = [];

  for (const crewId of crewIds) {
    let name = crewId;
    try {
      const crew = await getCrew(crewId);
      if (!crew) {
        results.push({ crewId, name, ok: false, error: 'not found' });
        continue;
      }
      name = `${crew.personal.firstName} ${crew.personal.lastName}`.trim() || crewId;

      if (Object.keys(contractPatch).length) await updateContract(crewId, contractPatch);

      if (projectId && projectName) {
        const previousName = await getProjectName(crew.projectId);
        await updateCrew(crewId, { projectId });
        // Move the crew member's whole Drive folder under the new project,
        // adopting whatever legacy layout it is currently in.
        const folders = await resolveCrewFolder({
          projectName,
          crewName: name,
          legacyProjectNames: [previousName, INTAKE_PROJECT_NAME],
        });
        await adminDb()
          .ref(`crew/${crewId}/documents`)
          .update({ driveFolder: folders.webViewLink });
      }

      results.push({ crewId, name, ok: true });
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
        .join(', '),
  });

  return NextResponse.json({ ok: okCount > 0, results });
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

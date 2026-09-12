import { NextResponse } from 'next/server';
import { adminDb, requireAdmin } from '@/lib/firebase/admin';
import { getCrew } from '@/lib/crew-db';
import { driveFileIdFromLink, trashDriveFile } from '@/lib/drive';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 300; // trashing a Drive folder is one round trip per crew

// Admin-only delete. Body: { crewIds: string[], trashDrive?: boolean }
//
// Removes the crew record itself plus everything keyed off it: the signing
// tokens and their short email references (otherwise a live /sign/{token} link
// would outlive the record it belongs to). Uploaded documents and generated
// contracts live in Google Drive; with `trashDrive` the crew member's Drive
// folder is moved to the trash as well, where it stays recoverable for 30 days.

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
  const trashDrive = body?.trashDrive === true;

  if (!crewIds.length) {
    return NextResponse.json({ error: 'crewIds required' }, { status: 400 });
  }
  if (crewIds.length > 200) {
    return NextResponse.json({ error: 'Too many crew selected (max 200)' }, { status: 400 });
  }

  const db = adminDb();
  const results: Array<{
    crewId: string;
    name: string;
    ok: boolean;
    driveTrashed?: boolean;
    error?: string;
  }> = [];

  for (const crewId of crewIds) {
    let name = crewId;
    try {
      const crew = await getCrew(crewId);
      if (!crew) {
        results.push({ crewId, name, ok: false, error: 'not found' });
        continue;
      }
      name = `${crew.personal.firstName} ${crew.personal.lastName}`.trim() || crewId;

      // Kill the signing links first: if anything below fails, we would rather
      // be left with an orphaned record than a live link to a deleted one.
      const tokens = [crew.contract.signTokenX, crew.contract.signTokenY];
      const refs = [crew.contract.signRefX, crew.contract.signRefY];
      for (const token of tokens) {
        if (token) await db.ref(`signTokens/${token}`).remove();
      }
      for (const ref of refs) {
        if (ref) await db.ref(`signRefs/${ref}`).remove();
      }

      // Drive is best-effort: a missing folder or an expired Drive credential
      // must not block removing the record from the dashboard.
      let driveTrashed = false;
      if (trashDrive) {
        const folderId = driveFileIdFromLink(crew.documents.driveFolder);
        if (folderId) {
          try {
            await trashDriveFile(folderId);
            driveTrashed = true;
          } catch (err) {
            console.error('[crew/delete] could not trash Drive folder', crewId, err);
          }
        }
      }

      await db.ref(`crew/${crewId}`).remove();

      await logAudit({
        action: 'crew_deleted',
        actor: admin.email,
        crewId,
        projectId: crew.projectId,
        detail:
          `${name} <${crew.personal.email}> · status=${crew.contract.status}` +
          (trashDrive
            ? ` · Drive folder ${driveTrashed ? 'moved to trash' : 'not found'}`
            : ' · Drive files kept'),
      });

      results.push({ crewId, name, ok: true, driveTrashed });
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
  return NextResponse.json({ ok: okCount > 0, deleted: okCount, results });
}

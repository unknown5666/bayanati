import { NextResponse } from 'next/server';
import { getCrew, getProjectName, updateCrew } from '@/lib/crew-db';
import { uploadToDrive } from '@/lib/drive';
import { adminBucket } from '@/lib/firebase/admin';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

// Called (best-effort) by the intake form after a successful submit. Copies the
// uploaded ID images from Firebase Storage into the crew's Drive folder and logs
// the submission. Safe to re-run (idempotent-ish): folders are reused.

export async function POST(req: Request) {
  let crewId: string | undefined;
  try {
    const body = await req.json();
    crewId = body?.crewId;
    if (!crewId) return NextResponse.json({ error: 'crewId required' }, { status: 400 });

    const crew = await getCrew(crewId);
    if (!crew) return NextResponse.json({ error: 'crew not found' }, { status: 404 });

    const projectName = await getProjectName(crew.projectId);
    const crewName = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();
    const basePath = ['Projects', projectName, 'Crew', crewName];

    const uploads: { key: string; path?: string; name: string }[] = [
      { key: 'emiratesIdFront', path: crew.documents.emiratesIdFront, name: 'Emirates_ID_Front.jpg' },
      { key: 'emiratesIdBack', path: crew.documents.emiratesIdBack, name: 'Emirates_ID_Back.jpg' },
      { key: 'passportImage', path: crew.documents.passportImage, name: 'Passport.jpg' },
    ];

    let folderId: string | undefined;
    const driveLinks: Record<string, string> = {};

    for (const u of uploads) {
      if (!u.path) continue;
      const file = adminBucket().file(u.path);
      const [data] = await file.download();
      const [meta] = await file.getMetadata();
      const result = await uploadToDrive({
        pathSegments: basePath,
        fileName: u.name,
        mimeType: meta.contentType ?? 'image/jpeg',
        data,
      });
      folderId = result.folderId;
      driveLinks[u.key] = result.webViewLink;
    }

    await updateCrew(crewId, {
      'documents/driveFolder': folderId
        ? `https://drive.google.com/drive/folders/${folderId}`
        : null,
    });

    await logAudit({
      action: 'crew_submitted',
      actor: 'crew',
      crewId,
      projectId: crew.projectId,
      detail: `Synced ${Object.keys(driveLinks).length} document(s) to Drive`,
    });

    return NextResponse.json({ ok: true, driveLinks });
  } catch (err) {
    console.error('[after-submit] error', err);
    await logAudit({
      action: 'crew_submit_sync_failed',
      actor: 'system',
      crewId,
      detail: err instanceof Error ? err.message : 'unknown error',
    });
    // Return 200 so the crew's success screen is never blocked; the dashboard
    // exposes a manual re-sync for failures.
    return NextResponse.json({ ok: false, error: 'sync deferred' });
  }
}

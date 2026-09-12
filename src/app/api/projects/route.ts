import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { listProjects, INTAKE_PROJECT_NAME } from '@/lib/crew-db';

export const runtime = 'nodejs';

// Admin-only: the project names available to assign crew to. Includes the
// intake default so the dashboard can always show where unassigned crew sit.
export async function GET(req: Request) {
  try {
    await requireAdmin(req.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const projects = await listProjects();
  const names = [INTAKE_PROJECT_NAME, ...projects.map((p) => p.name)].filter(
    (n, i, a) => a.indexOf(n) === i,
  );
  return NextResponse.json({ ok: true, projects, names });
}

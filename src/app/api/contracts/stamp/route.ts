import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { getCrew } from '@/lib/crew-db';
import { loadStampPng } from '@/lib/stamp';
import { stampSignedContracts } from '@/lib/stamp-run';
import { logAudit } from '@/lib/audit';
import type { ContractType } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Admin-only: apply the company stamp to the SIGNED contract PDFs of one or
// more crew members. Accepts { crewId } or { crewIds: [...] } (for bulk). For
// each crew, every already-signed contract (X→A, Y→R) is fetched back from
// Drive, stamped bottom-left, and re-uploaded into the crew member's folder.

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
  // Bulk stamping skips contracts that already carry the seal, so re-running it
  // over a whole selection only does the work that is left.
  const onlyMissing = body?.onlyMissing === true;

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

      const copies = await stampSignedContracts(crewId, crew, ['X', 'Y'], stampPng, {
        save: true,
        onlyMissing,
      });
      const links: Partial<Record<ContractType, string>> = {};
      for (const type of ['X', 'Y'] as ContractType[]) {
        const link = copies[type]?.link;
        if (link) links[type] = link;
      }
      const stampedCount = Object.keys(links).length;

      if (stampedCount === 0) {
        results.push({
          crewId,
          ok: false,
          error: 'no signed contract on file to stamp',
        });
        continue;
      }

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

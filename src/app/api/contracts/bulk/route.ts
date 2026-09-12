import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { logAudit } from '@/lib/audit';
import {
  LETTER,
  normaliseTypes,
  runContracts,
  type ContractMode,
  type ContractRunResult,
} from '@/lib/contract-run';
import { getCrew } from '@/lib/crew-db';

export const runtime = 'nodejs';
export const maxDuration = 300; // dozens of PDFs + Docuseal calls

// Admin-only bulk contract run. Body:
//   { crewIds: string[], mode: 'generate' | 'send', types?: ('X'|'Y')[] }
//
// Crew are processed one at a time so a single bad record (missing amount,
// Docuseal hiccup) never aborts the batch — every outcome comes back in
// `results`, keyed by crewId, for the dashboard to report.

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
  if (!crewIds.length) {
    return NextResponse.json({ error: 'crewIds required' }, { status: 400 });
  }
  if (crewIds.length > 200) {
    return NextResponse.json({ error: 'Too many crew selected (max 200)' }, { status: 400 });
  }

  const mode: ContractMode = body?.mode === 'send' ? 'send' : 'generate';
  const types = normaliseTypes(body?.types);

  const results: ContractRunResult[] = [];
  for (const crewId of crewIds) {
    let name = crewId;
    try {
      const existing = await getCrew(crewId);
      if (existing) {
        name = `${existing.personal.firstName} ${existing.personal.lastName}`.trim() || crewId;
      }
      const { links, signLinks } = await runContracts({ crewId, mode, types });
      results.push({ crewId, ok: true, name, types, links, signLinks });
    } catch (err) {
      results.push({
        crewId,
        ok: false,
        name,
        types,
        links: {},
        signLinks: {},
        error: err instanceof Error ? err.message : 'failed',
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  await logAudit({
    action: mode === 'send' ? 'contracts_bulk_sent' : 'contracts_bulk_generated',
    actor: admin.email,
    detail: `${mode} ${types.map((t) => LETTER[t]).join('+')} for ${okCount}/${crewIds.length} crew`,
  });

  return NextResponse.json({ ok: okCount > 0, mode, types, results });
}

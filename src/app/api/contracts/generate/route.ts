import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { logAudit } from '@/lib/audit';
import { LETTER, normaliseTypes, runContracts, type ContractMode } from '@/lib/contract-run';

export const runtime = 'nodejs';
export const maxDuration = 60; // PDF + Drive + email can take a few seconds

// Admin-only. Every PDF is bilingual (English | Arabic). Body:
//   mode:  'generate' — build the selected PDFs, store in Drive, return links.
//          'send'     — additionally email EACH selected contract SEPARATELY,
//                       with the PDF attached and a one-time signing link.
//   types: ['X'] | ['Y'] | ['X','Y']  — which contracts to act on (default both).
//
// Signing is self-hosted: each sent contract gets a token (behind /sign/{token})
// and a short reference printed in the subject, so a crew member can either sign
// on their phone or reply with a scan — see src/lib/sign-tokens.ts.
//
// The work itself lives in lib/contract-run.ts, shared with the bulk route.

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin(req.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const crewId: string | undefined = body?.crewId;
  const mode: ContractMode = body?.mode === 'generate' ? 'generate' : 'send';
  if (!crewId) return NextResponse.json({ error: 'crewId required' }, { status: 400 });

  const types = normaliseTypes(body?.types);

  try {
    const { crew, links, signLinks } = await runContracts({ crewId, mode, types });

    await logAudit({
      action: mode === 'send' ? 'contracts_sent' : 'contracts_generated',
      actor: admin.email,
      crewId,
      projectId: crew.projectId,
      detail:
        mode === 'send'
          ? `Emailed ${types.map((t) => LETTER[t]).join(', ')} (PDF attached) → ${crew.personal.email}`
          : `Generated ${types.map((t) => LETTER[t]).join(', ')} for review (not sent)`,
    });

    return NextResponse.json({ ok: true, mode, types, links, signLinks });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Contract generation failed';
    const status =
      message === 'crew not found' ? 404 : message.startsWith('Missing') ? 400 : 500;
    if (status === 500) console.error('[contracts/generate] error', err);
    await logAudit({
      action: mode === 'generate' ? 'contracts_generate_failed' : 'contracts_send_failed',
      actor: admin.email,
      crewId,
      detail: message,
    });
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { getCrew, updateContract } from '@/lib/crew-db';
import { logAudit } from '@/lib/audit';
import { validateIban } from '@/lib/validation';

export const runtime = 'nodejs';

// Admin-only: set role, amounts, dates, IBAN, or reassign project on a crew
// member. Accepts a partial patch and validates each provided field.

interface Patch {
  role?: string;
  amountX?: number;
  amountY?: number;
  dateFrom?: string;
  dateTo?: string;
  iban?: string;
  projectId?: string;
  // Free-text overrides for the values printed on the contract.
  overrides?: Partial<
    Record<'crewName' | 'projectName' | 'emiratesId' | 'passport' | 'nationality', string>
  >;
}

const OVERRIDE_KEYS = ['crewName', 'projectName', 'emiratesId', 'passport', 'nationality'] as const;

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin(req.headers.get('authorization'));
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const crewId: string | undefined = body?.crewId;
  const patch: Patch = body?.patch ?? {};
  if (!crewId) return NextResponse.json({ error: 'crewId required' }, { status: 400 });

  const crew = await getCrew(crewId);
  if (!crew) return NextResponse.json({ error: 'crew not found' }, { status: 404 });

  const contractPatch: Record<string, unknown> = {};
  const projectPatch: Record<string, unknown> = {};

  if (patch.role !== undefined) contractPatch.role = String(patch.role).slice(0, 120);
  if (patch.amountX !== undefined) {
    if (!(patch.amountX >= 0)) return bad('amountX must be a positive number');
    contractPatch.amountX = Number(patch.amountX);
  }
  if (patch.amountY !== undefined) {
    if (!(patch.amountY >= 0)) return bad('amountY must be a positive number');
    contractPatch.amountY = Number(patch.amountY);
  }
  if (patch.dateFrom !== undefined) contractPatch.dateFrom = String(patch.dateFrom);
  if (patch.dateTo !== undefined) contractPatch.dateTo = String(patch.dateTo);
  if (patch.iban !== undefined) {
    const check = validateIban(patch.iban);
    if (!check.ok) return bad(check.message ?? 'invalid IBAN');
    contractPatch.iban = patch.iban.replace(/\s/g, '').toUpperCase();
  }
  if (patch.projectId !== undefined) projectPatch.projectId = String(patch.projectId);

  if (patch.overrides !== undefined && patch.overrides !== null) {
    // Merge onto existing overrides; a trimmed-empty value clears that field
    // (falls back to the derived intake value at generation time).
    const merged: Record<string, string> = { ...(crew.contract.overrides ?? {}) };
    for (const key of OVERRIDE_KEYS) {
      const raw = patch.overrides[key];
      if (raw === undefined) continue;
      const value = String(raw).trim().slice(0, 200);
      if (value) merged[key] = value;
      else delete merged[key];
    }
    // Firebase drops empty objects; store null to clear the map entirely.
    contractPatch.overrides = Object.keys(merged).length ? merged : null;
  }

  if (Object.keys(contractPatch).length) await updateContract(crewId, contractPatch);
  if (Object.keys(projectPatch).length) {
    const { updateCrew } = await import('@/lib/crew-db');
    await updateCrew(crewId, projectPatch);
  }

  await logAudit({
    action: 'crew_updated',
    actor: admin.email,
    crewId,
    projectId: crew.projectId,
    detail: Object.keys({ ...contractPatch, ...projectPatch }).join(', '),
  });

  return NextResponse.json({ ok: true });
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

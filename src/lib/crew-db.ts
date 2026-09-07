import 'server-only';

// Server-side crew + project reads/writes via the Admin SDK.

import { adminDb } from './firebase/admin';
import type { CrewMember, ContractStatus } from './types';

export async function getCrew(crewId: string): Promise<CrewMember | null> {
  const snap = await adminDb().ref(`crew/${crewId}`).get();
  return snap.exists() ? (snap.val() as CrewMember) : null;
}

export async function updateCrew(
  crewId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await adminDb().ref(`crew/${crewId}`).update({ ...patch, updatedAt: Date.now() });
}

export async function updateContract(
  crewId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [k, v] of Object.entries(patch)) {
    updates[`contract/${k}`] = v;
  }
  await adminDb().ref(`crew/${crewId}`).update(updates);
}

export async function setContractStatus(
  crewId: string,
  status: ContractStatus,
): Promise<void> {
  await adminDb().ref(`crew/${crewId}/contract`).update({ status });
  await adminDb().ref(`crew/${crewId}`).update({ updatedAt: Date.now() });
}

export async function getProjectName(projectId: string): Promise<string> {
  if (projectId === '_intake') return 'Intake';
  const snap = await adminDb().ref(`projects/${projectId}/name`).get();
  return snap.exists() ? String(snap.val()) : projectId;
}

/**
 * Combine the two signature records into an overall status. Preserves 'sent'
 * when neither is signed yet.
 */
export function deriveStatus(
  signedX: boolean,
  signedY: boolean,
  current: ContractStatus,
): ContractStatus {
  if (signedX && signedY) return 'both_signed';
  if (signedX) return 'signed_x';
  if (signedY) return 'signed_y';
  return current === 'sent' ? 'sent' : current;
}

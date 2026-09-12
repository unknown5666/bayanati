import 'server-only';

// Server-side crew + project reads/writes via the Admin SDK.

import { adminDb } from './firebase/admin';
import type { CrewMember, ContractStatus } from './types';
// Project folder name for crew not yet assigned a project. Kept at its
// historical value so existing Drive folders are still found.
export { INTAKE_PROJECT_ID, INTAKE_PROJECT_NAME } from './project-constants';
import { INTAKE_PROJECT_ID, INTAKE_PROJECT_NAME } from './project-constants';

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
  if (projectId === INTAKE_PROJECT_ID) return INTAKE_PROJECT_NAME;
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

export async function listProjects(): Promise<Array<{ id: string; name: string }>> {
  const snap = await adminDb().ref('projects').get();
  if (!snap.exists()) return [];
  const val = snap.val() as Record<string, { name?: string }>;
  return Object.entries(val)
    .map(([id, p]) => ({ id, name: String(p?.name ?? id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Project id for a name, creating the project when it does not exist yet. */
export async function ensureProjectByName(name: string): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error('Project name is required');
  const existing = await listProjects();
  const match = existing.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (match) return match.id;

  const id =
    clean.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') ||
    `project_${Date.now()}`;
  await adminDb().ref(`projects/${id}`).set({ id, name: clean, createdAt: Date.now() });
  return id;
}

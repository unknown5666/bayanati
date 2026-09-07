import 'server-only';

// Append-only audit trail in the Realtime DB under /audit.

import { adminDb } from './firebase/admin';

export async function logAudit(entry: {
  action: string;
  actor: string; // admin email, 'crew', or 'system'
  crewId?: string;
  projectId?: string;
  detail?: string;
}): Promise<void> {
  try {
    const ref = adminDb().ref('audit').push();
    await ref.set({
      id: ref.key,
      timestamp: Date.now(),
      action: entry.action,
      actor: entry.actor,
      crewId: entry.crewId ?? null,
      projectId: entry.projectId ?? null,
      detail: entry.detail ?? null,
    });
  } catch (err) {
    // Never let audit failure break the main flow; surface in server logs.
    console.error('[audit] failed to write entry', entry.action, err);
  }
}

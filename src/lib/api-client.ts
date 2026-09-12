'use client';

// Authenticated fetch helpers for admin API routes.

import { authHeader } from './use-admin-auth';

async function post<T>(url: string, body: unknown): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface ContractFieldOverridesPatch {
  crewName?: string;
  projectName?: string;
  emiratesId?: string;
  passport?: string;
  nationality?: string;
}

export interface CrewPatch {
  role?: string;
  amountX?: number;
  amountY?: number;
  dateFrom?: string;
  dateTo?: string;
  iban?: string;
  projectId?: string;
  overrides?: ContractFieldOverridesPatch;
}

export function updateCrew(crewId: string, patch: CrewPatch) {
  return post<{ ok: true }>('/api/crew/update', { crewId, patch });
}

export interface ContractLinks {
  X?: string;
  Y?: string;
}

export type ContractType = 'X' | 'Y';

/** Build the selected bilingual PDFs and return Drive view links WITHOUT sending. */
export function generateContracts(crewId: string, types: ContractType[] = ['X', 'Y']) {
  return post<{ ok: true; mode: 'generate'; types: ContractType[]; links: ContractLinks }>(
    '/api/contracts/generate',
    { crewId, mode: 'generate', types },
  );
}

/**
 * Build the selected PDFs and email EACH separately with the PDF attached and a
 * one-time signing link. `signLinks` are those links, so an admin can also send
 * one over WhatsApp if the crew member never opens their email.
 */
export function sendContracts(crewId: string, types: ContractType[] = ['X', 'Y']) {
  return post<{
    ok: true;
    mode: 'send';
    types: ContractType[];
    links: ContractLinks;
    signLinks: ContractLinks;
  }>('/api/contracts/generate', { crewId, mode: 'send', types });
}

export interface StampResult {
  crewId: string;
  ok: boolean;
  stamped?: number;
  links?: ContractLinks;
  error?: string;
}

/** Apply the company stamp to the SIGNED contracts of one or more crew. */
export function stampContracts(crewIds: string[]) {
  return post<{ ok: boolean; results: StampResult[] }>('/api/contracts/stamp', {
    crewIds,
  });
}

export interface InboxPollResult {
  ok: boolean;
  scanned: number;
  filed: number;
  rejected: number;
  unmatched: number;
  ignored: number;
  messages: Array<{
    from: string;
    subject: string;
    outcome: 'filed' | 'rejected' | 'unmatched' | 'ignored';
    crewId?: string;
    contract?: 'A' | 'R';
    note?: string;
  }>;
  errors: string[];
}

/**
 * Check the contracts mailbox now for replies carrying signed scans. The server
 * also polls on its own schedule; this is the "don't wait" button.
 */
export function checkInbox() {
  return post<InboxPollResult>('/api/inbox/poll', {});
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export interface BulkContractResult {
  crewId: string;
  ok: boolean;
  name: string;
  types: ContractType[];
  links: ContractLinks;
  signLinks: ContractLinks;
  error?: string;
}

/** Generate (or generate + send) contracts for many crew in one request. */
export function bulkContracts(
  crewIds: string[],
  mode: 'generate' | 'send',
  types: ContractType[] = ['X', 'Y'],
) {
  return post<{ ok: boolean; mode: string; results: BulkContractResult[] }>(
    '/api/contracts/bulk',
    { crewIds, mode, types },
  );
}

export interface BulkUpdateResult {
  crewId: string;
  name: string;
  ok: boolean;
  error?: string;
}

export interface BulkPatch {
  projectName?: string;
  role?: string;
  dateFrom?: string;
  dateTo?: string;
  amountX?: number;
  amountY?: number;
  iban?: string;
}

/** Apply the same fields (and/or project) to many crew at once. */
export function bulkUpdateCrew(crewIds: string[], patch: BulkPatch) {
  return post<{ ok: boolean; results: BulkUpdateResult[] }>('/api/crew/bulk-update', {
    crewIds,
    patch,
  });
}

export function listProjects() {
  return getJson<{ ok: true; names: string[]; projects: Array<{ id: string; name: string }> }>(
    '/api/projects',
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/**
 * Download the selected crew's contracts as a single ZIP. The endpoint needs an
 * auth header, so the response is fetched as a blob and handed to the browser
 * through a temporary object URL rather than a plain link.
 */
export async function downloadContractsZip(
  crewIds: string[],
  types: ContractType[] = ['X', 'Y'],
  kind: 'contract' | 'signed' = 'contract',
): Promise<{ count: number; skipped: string }> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
  const res = await fetch('/api/contracts/download', {
    method: 'POST',
    headers,
    body: JSON.stringify({ crewIds, types, kind }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string })?.error ?? `Download failed (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const named = /filename="([^"]+)"/.exec(disposition)?.[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = named ?? 'contracts.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — Safari needs the URL to survive the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return {
    count: Number(res.headers.get('X-File-Count') ?? 0),
    skipped: decodeURIComponent(res.headers.get('X-Skipped') ?? ''),
  };
}

export interface DeleteCrewResult {
  crewId: string;
  name: string;
  ok: boolean;
  driveTrashed?: boolean;
  error?: string;
}

/**
 * Permanently remove crew records and their signing links. With `trashDrive`
 * their Google Drive folder is moved to the trash too (recoverable there for
 * 30 days); otherwise the uploaded documents and contracts are left in place.
 */
export function deleteCrew(crewIds: string[], trashDrive: boolean) {
  return post<{ ok: boolean; deleted: number; results: DeleteCrewResult[] }>(
    '/api/crew/delete',
    { crewIds, trashDrive },
  );
}

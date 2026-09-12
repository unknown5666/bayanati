'use client';

// Authenticated fetch helpers for admin API routes.

import { authHeader } from './use-admin-auth';
import type { ColumnKey, SheetRow } from './crew-sheet';

async function post<T>(url: string, body: unknown): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    // fetch only rejects when no response arrived at all. The browser's own
    // message for that is "Failed to fetch", which tells an admin nothing —
    // say what actually happened and what to do about it.
    throw new Error(
      'The server did not respond — the request may have taken too long, or the ' +
        'connection dropped. Try again with fewer crew selected.',
    );
  }
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
  /** The edit was saved, but the Drive folder could not be moved. */
  driveError?: string;
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

/**
 * Apply the same fields (and/or project) to many crew at once.
 *
 * Sent in small batches rather than one request. Setting a project moves each
 * crew member's Drive folder, which is several Drive round trips per person, so
 * one request covering a whole unit easily outlives a proxy's idle timeout —
 * which reaches the browser as a bare "Failed to fetch" with no way to tell
 * what was written. Batching keeps every request short, and a batch that does
 * fail only costs the crew inside it.
 */
export async function bulkUpdateCrew(
  crewIds: string[],
  patch: BulkPatch,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; driveFailures: number; results: BulkUpdateResult[] }> {
  // A project change is the slow path; field-only edits are one DB write each.
  const size = patch.projectName ? 5 : 40;
  const results: BulkUpdateResult[] = [];
  let driveFailures = 0;

  for (let i = 0; i < crewIds.length; i += size) {
    const batch = crewIds.slice(i, i + size);
    try {
      const res = await post<{
        ok: boolean;
        driveFailures?: number;
        results: BulkUpdateResult[];
      }>('/api/crew/bulk-update', { crewIds: batch, patch });
      results.push(...res.results);
      driveFailures += res.driveFailures ?? 0;
    } catch (err) {
      // A failed batch must not discard the batches that already succeeded —
      // report it per crew member and carry on.
      const message = err instanceof Error ? err.message : 'failed';
      // A bad patch (invalid IBAN, unusable project name) fails identically for
      // every batch, so stop rather than replay the same error N times.
      const fatal = /IBAN|project name|Too many|Nothing to update|unauthorized/i.test(
        message,
      );
      for (const crewId of batch) results.push({ crewId, name: crewId, ok: false, error: message });
      if (fatal) {
        for (const crewId of crewIds.slice(i + size)) {
          results.push({ crewId, name: crewId, ok: false, error: message });
        }
        break;
      }
    }
    onProgress?.(Math.min(i + size, crewIds.length), crewIds.length);
  }

  return { ok: results.some((r) => r.ok), driveFailures, results };
}

// ---------------------------------------------------------------------------
// Crew sheet import
// ---------------------------------------------------------------------------

export interface SheetImportResponse {
  ok: true;
  filename: string;
  sheetName: string;
  headerLine: number;
  columns: Partial<Record<ColumnKey, number>>;
  rows: SheetRow[];
}

/**
 * Read a crew sheet on the server and get back what it says. Nothing is saved:
 * the rows come back for review, and the admin applies them from there.
 */
export async function importCrewSheet(file: File): Promise<SheetImportResponse> {
  const buffer = await file.arrayBuffer();
  // btoa() needs a binary string, and spreading a 5 MB array into
  // String.fromCharCode blows the call stack — convert in chunks.
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return post<SheetImportResponse>('/api/crew/import-sheet', {
    filename: file.name,
    data: btoa(binary),
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

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

export interface CrewPatch {
  role?: string;
  amountX?: number;
  amountY?: number;
  dateFrom?: string;
  dateTo?: string;
  iban?: string;
  projectId?: string;
}

export function updateCrew(crewId: string, patch: CrewPatch) {
  return post<{ ok: true }>('/api/crew/update', { crewId, patch });
}

export interface ContractLinks {
  X?: string;
  Y?: string;
}

/** Build the contract PDFs and return Drive view links WITHOUT sending. */
export function generateContracts(crewId: string) {
  return post<{ ok: true; mode: 'generate'; links: ContractLinks }>(
    '/api/contracts/generate',
    { crewId, mode: 'generate' },
  );
}

/** Build the PDFs, create the Docuseal signing requests, and email the crew. */
export function sendContracts(crewId: string) {
  return post<{ ok: true; mode: 'send'; links: ContractLinks }>(
    '/api/contracts/generate',
    { crewId, mode: 'send' },
  );
}

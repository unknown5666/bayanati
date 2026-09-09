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

/** Build the selected PDFs, create Docuseal requests, and email EACH separately. */
export function sendContracts(crewId: string, types: ContractType[] = ['X', 'Y']) {
  return post<{ ok: true; mode: 'send'; types: ContractType[]; links: ContractLinks }>(
    '/api/contracts/generate',
    { crewId, mode: 'send', types },
  );
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

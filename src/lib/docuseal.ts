import 'server-only';

// Minimal Docuseal API client (self-hosted). Auth is the X-Auth-Token header.
// Flow: create a template from a generated PDF (with one signature field), then
// create a submission for the crew member and return their signing URL.

import type { ContractType } from './types';

function base(): string {
  const url = process.env.DOCUSEAL_BASE_URL;
  if (!url) throw new Error('DOCUSEAL_BASE_URL is not set.');
  return url.replace(/\/$/, '');
}

function headers(): Record<string, string> {
  const key = process.env.DOCUSEAL_API_KEY;
  if (!key) throw new Error('DOCUSEAL_API_KEY is not set.');
  return { 'Content-Type': 'application/json', 'X-Auth-Token': key };
}

async function api<T>(pathname: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${base()}/api${pathname}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Docuseal ${pathname} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

const SIGNER_ROLE = 'Crew';

/**
 * Resolve the reusable Docuseal template to sign for a given contract type.
 *
 * Creating a template from a PDF via API (`POST /templates/pdf`) is a Docuseal
 * PRO feature, so the free/community edition can't do it. Instead the template
 * is built ONCE in the Docuseal UI (a fillable contract with named fields + a
 * Crew signature/date), and its id is configured here. Per-crew values are then
 * pre-filled on each submission (see `createSubmission`).
 *
 * Config (env): `DOCUSEAL_TEMPLATE_ID_X` / `DOCUSEAL_TEMPLATE_ID_Y` for the two
 * contracts, or a single `DOCUSEAL_TEMPLATE_ID` used for both.
 */
export function templateIdForType(type: ContractType): number {
  const perType =
    type === 'X'
      ? process.env.DOCUSEAL_TEMPLATE_ID_X
      : process.env.DOCUSEAL_TEMPLATE_ID_Y;
  const raw = perType ?? process.env.DOCUSEAL_TEMPLATE_ID;
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw new Error(
      `No Docuseal template configured for contract ${type}. Build the contract ` +
        `template once in the Docuseal console, then set DOCUSEAL_TEMPLATE_ID_${type} ` +
        `(or DOCUSEAL_TEMPLATE_ID for both) in the app environment. Creating a ` +
        `template from a PDF via API requires Docuseal Pro, so a prebuilt template ` +
        `is used instead.`,
    );
  }
  return id;
}

export interface SubmissionResult {
  submissionId: number;
  signUrl: string;
}

/**
 * Create a submission for one crew member against a prebuilt template. Per-crew
 * contract values are pre-filled as read-only fields (`fields[]` with
 * `default_value` + `readonly`), so the crew sees their own terms but can only
 * edit the signature/date. Field NAMES must match the fields placed in the
 * template (see DOCUSEAL_SETUP.md); Docuseal ignores names it doesn't find.
 *
 * We disable Docuseal's own email (send_email: false) and deliver our branded
 * email with the signing link(s) instead.
 */
export async function createSubmission(params: {
  templateId: number;
  email: string;
  name: string;
  fields?: Record<string, string | undefined>;
}): Promise<SubmissionResult> {
  const prefilled = Object.entries(params.fields ?? {})
    .filter(([, v]) => v != null && v !== '' && v !== '—')
    .map(([name, value]) => ({ name, default_value: value, readonly: true }));

  const submitters = await api<
    Array<{ id: number; submission_id: number; slug: string }>
  >('/submissions', {
    method: 'POST',
    body: JSON.stringify({
      template_id: params.templateId,
      send_email: false,
      submitters: [
        {
          role: SIGNER_ROLE,
          email: params.email,
          name: params.name,
          ...(prefilled.length ? { fields: prefilled } : {}),
        },
      ],
    }),
  });

  const first = submitters[0];
  if (!first) throw new Error('Docuseal returned no submitter');
  return {
    submissionId: first.submission_id,
    signUrl: `${base()}/s/${first.slug}`,
  };
}

/** Download a completed (signed) document from Docuseal as a PDF buffer. */
export async function downloadSubmissionPdf(submissionId: number): Promise<Buffer> {
  const sub = await api<{ documents?: Array<{ url: string }>; combined_document_url?: string }>(
    `/submissions/${submissionId}`,
    { method: 'GET' },
  );
  const url = sub.combined_document_url ?? sub.documents?.[0]?.url;
  if (!url) throw new Error(`No signed document URL on submission ${submissionId}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download signed PDF (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export function labelForType(type: ContractType): string {
  return `Contract ${type}`;
}

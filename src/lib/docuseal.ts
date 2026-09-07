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

/** Create a Docuseal template from a PDF, with one crew signature field. */
export async function createTemplateFromPdf(params: {
  name: string;
  pdf: Uint8Array;
}): Promise<{ templateId: number }> {
  const fileBase64 = Buffer.from(params.pdf).toString('base64');
  const body = {
    name: params.name,
    documents: [
      {
        name: params.name,
        file: fileBase64,
        fields: [
          {
            name: 'Signature',
            type: 'signature',
            role: SIGNER_ROLE,
            // Areas use page-relative ratios (0..1). Bottom band of page 1.
            areas: [{ x: 0.58, y: 0.86, w: 0.32, h: 0.06, page: 0 }],
          },
          {
            name: 'Date',
            type: 'date',
            role: SIGNER_ROLE,
            areas: [{ x: 0.58, y: 0.93, w: 0.32, h: 0.03, page: 0 }],
          },
        ],
      },
    ],
  };
  const res = await api<{ id: number }>('/templates/pdf', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { templateId: res.id };
}

export interface SubmissionResult {
  submissionId: number;
  signUrl: string;
}

/**
 * Create a submission for one crew member. We disable Docuseal's own email
 * (send_email: false) and deliver our branded email with both signing links.
 */
export async function createSubmission(params: {
  templateId: number;
  email: string;
  name: string;
}): Promise<SubmissionResult> {
  const submitters = await api<
    Array<{ id: number; submission_id: number; slug: string }>
  >('/submissions', {
    method: 'POST',
    body: JSON.stringify({
      template_id: params.templateId,
      send_email: false,
      submitters: [
        { role: SIGNER_ROLE, email: params.email, name: params.name },
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

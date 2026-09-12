// Client-side CSV export of crew bank details. The dashboard already holds the
// full crew list, so nothing needs to go back to the server — the file is built
// in the browser and handed over through a temporary object URL, the same way
// `downloadContractsZip` delivers its ZIP.

import type { CrewMember } from './types';
import { INTAKE_PROJECT_ID, INTAKE_PROJECT_NAME } from './project-constants';

export interface IbanRow {
  name: string;
  iban: string;
  email: string;
  phone: string;
  role: string;
  project: string;
  amountX: string;
  amountY: string;
}

/** Display name, honouring an admin's contract override. */
function crewName(c: CrewMember): string {
  const override = c.contract?.overrides?.crewName?.trim();
  if (override) return override;
  return `${c.personal?.firstName ?? ''} ${c.personal?.lastName ?? ''}`.trim();
}

/**
 * Everyone who actually has an IBAN on file, newest intake last. Crew without
 * one are left out entirely — the export exists to be pasted into a payment
 * run, and a blank IBAN row is worse than a missing one.
 */
export function ibanRows(
  crew: CrewMember[],
  projectsById: Record<string, string> = {},
): IbanRow[] {
  const projectName: Record<string, string> = {
    [INTAKE_PROJECT_ID]: INTAKE_PROJECT_NAME,
    ...projectsById,
  };

  return crew
    .filter((c) => Boolean(c.contract?.iban?.trim()))
    .map((c) => ({
      name: crewName(c),
      iban: (c.contract.iban ?? '').trim().toUpperCase().replace(/\s+/g, ''),
      email: c.personal?.email ?? '',
      phone: c.personal?.phone ?? '',
      role: c.contract?.role ?? '',
      project:
        c.contract?.overrides?.projectName?.trim() ||
        projectName[c.projectId] ||
        c.projectId,
      amountX: c.contract?.amountX == null ? '' : String(c.contract.amountX),
      amountY: c.contract?.amountY == null ? '' : String(c.contract.amountY),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const HEADERS = [
  'Name',
  'IBAN',
  'Email',
  'Phone',
  'Role',
  'Project',
  'Amount A (AED)',
  'Amount R (AED)',
];

/**
 * Quote a CSV field. Excel treats a leading =, +, - or @ as a formula, so those
 * are prefixed with a tab — an IBAN or a +971 phone number must arrive as text.
 */
function cell(value: string): string {
  const v = /^[=+\-@]/.test(value) ? `\t${value}` : value;
  return `"${v.replace(/"/g, '""')}"`;
}

export function ibanCsv(rows: IbanRow[]): string {
  const lines = [HEADERS.map(cell).join(',')];
  for (const r of rows) {
    lines.push(
      [r.name, r.iban, r.email, r.phone, r.role, r.project, r.amountX, r.amountY]
        .map(cell)
        .join(','),
    );
  }
  // CRLF + a UTF-8 BOM so Excel opens Arabic names and the header row correctly.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Hand a generated file to the browser as a download. */
export function saveFile(content: string, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — Safari needs the URL to survive the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download name + IBAN (plus the fields a payment run needs) for every crew
 * member who has one. Returns how many rows were written and how many crew were
 * skipped for having no IBAN, so the caller can say so.
 */
export function downloadIbanCsv(
  crew: CrewMember[],
  projectsById: Record<string, string> = {},
  fileNameHint = 'crew',
): { count: number; skipped: number } {
  const rows = ibanRows(crew, projectsById);
  const stamp = new Date().toISOString().slice(0, 10);
  saveFile(ibanCsv(rows), `${fileNameHint}-ibans-${stamp}.csv`, 'text/csv;charset=utf-8');
  return { count: rows.length, skipped: crew.length - rows.length };
}

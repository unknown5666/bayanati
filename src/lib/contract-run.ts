import 'server-only';

// The contract engine shared by the single-crew and bulk routes: build the
// bilingual PDF(s), file them in the crew member's Drive folder, and — in
// 'send' mode — email each contract separately with the PDF attached and its
// own one-time signing link.

import { getCrew, getProjectName, updateContract, INTAKE_PROJECT_NAME } from './crew-db';
import { buildPlaceholders, generateContractPdf, formatAed } from './contract-pdf';
import { resolveCrewFolder, uploadToFolder } from './drive';
import { createSignToken, revokeSignToken, signUrlFor } from './sign-tokens';
import { sendContractEmail } from './email';
import type { ContractType, CrewMember } from './types';

export const LETTER: Record<ContractType, 'A' | 'R'> = { X: 'A', Y: 'R' };

export type ContractMode = 'generate' | 'send';

export interface ContractRunResult {
  crewId: string;
  ok: boolean;
  name: string;
  types: ContractType[];
  links: Partial<Record<ContractType, string>>;
  signLinks: Partial<Record<ContractType, string>>;
  error?: string;
}

/** Normalise a requested contract selection; defaults to both. */
export function normaliseTypes(requested: unknown): ContractType[] {
  let types: ContractType[] = Array.isArray(requested)
    ? (requested.filter((t) => t === 'X' || t === 'Y') as ContractType[])
    : ['X', 'Y'];
  types = types.filter((t, i) => types.indexOf(t) === i);
  return types.length ? types : ['X', 'Y'];
}

/** Fields required before the selected contracts can be produced. */
export function missingFields(
  crew: CrewMember,
  types: ContractType[],
  mode: ContractMode,
): string[] {
  const c = crew.contract;
  const missing: string[] = [];
  if (!c.role) missing.push('role');
  if (!c.dateFrom) missing.push('dateFrom');
  if (!c.dateTo) missing.push('dateTo');
  if (!c.iban) missing.push('iban');
  if (types.includes('X') && c.amountX == null) missing.push('amountX');
  if (types.includes('Y') && c.amountY == null) missing.push('amountY');
  if (mode === 'send' && !crew.personal.email) missing.push('email');
  return missing;
}

export function contractFileName(crew: CrewMember, type: ContractType): string {
  const { firstName, lastName } = crew.personal;
  return `Contract - ${firstName} - ${lastName} - ${LETTER[type]}.pdf`;
}

/**
 * Run one crew member's contracts. Throws on failure so callers can decide
 * whether to abort (single crew) or record and carry on (bulk).
 */
export async function runContracts(params: {
  crewId: string;
  mode: ContractMode;
  types: ContractType[];
}): Promise<{
  crew: CrewMember;
  links: Partial<Record<ContractType, string>>;
  signLinks: Partial<Record<ContractType, string>>;
}> {
  const { crewId, mode, types } = params;
  const crew = await getCrew(crewId);
  if (!crew) throw new Error('crew not found');

  const missing = missingFields(crew, types, mode);
  if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);

  const c = crew.contract;
  const projectName = await getProjectName(crew.projectId);
  const crewName = `${crew.personal.firstName} ${crew.personal.lastName}`.trim();

  // One folder per crew member, adopting anything left in the legacy layout.
  const folders = await resolveCrewFolder({
    projectName,
    crewName,
    legacyProjectNames: [INTAKE_PROJECT_NAME],
  });

  const links: Partial<Record<ContractType, string>> = {};
  const signLinks: Partial<Record<ContractType, string>> = {};
  const updates: Record<string, unknown> = { generatedAt: Date.now() };

  for (const type of types) {
    const placeholders = buildPlaceholders(crew, type, projectName);
    const pdf = await generateContractPdf({ placeholders });
    const fileName = contractFileName(crew, type);

    const up = await uploadToFolder({
      folderId: folders.contractsId,
      fileName,
      mimeType: 'application/pdf',
      data: pdf,
    });
    links[type] = up.webViewLink;
    updates[type === 'X' ? 'pdfLinkX' : 'pdfLinkY'] = up.webViewLink;
    updates[type === 'X' ? 'pdfFileIdX' : 'pdfFileIdY'] = up.fileId;

    if (mode === 'send') {
      // Re-sending supersedes the previous link: burn the old token so only
      // the newest email can be used to sign.
      await revokeSignToken(type === 'X' ? c.signTokenX : c.signTokenY);
      const token = await createSignToken({ crewId, type });
      const signUrl = signUrlFor(token.token);
      signLinks[type] = signUrl;

      updates[type === 'X' ? 'signTokenX' : 'signTokenY'] = token.token;
      updates[type === 'X' ? 'signRefX' : 'signRefY'] = token.ref;
      updates[type === 'X' ? 'signUrlX' : 'signUrlY'] = signUrl;

      // A SEPARATE email per contract, each with its own PDF and reference.
      await sendContractEmail({
        to: crew.personal.email,
        crewName: placeholders.CREW_NAME,
        projectName,
        role: c.role!,
        dateFrom: c.dateFrom!,
        dateTo: c.dateTo!,
        amount: formatAed(type === 'X' ? c.amountX : c.amountY),
        contractLabel: LETTER[type],
        reference: token.ref,
        signUrl,
        pdf: { filename: fileName, content: pdf },
      });
    }
  }

  if (mode === 'send') {
    updates.status = 'sent';
    updates.sentAt = Date.now();
  } else if (c.status === 'submitted') {
    updates.status = 'pending';
  }
  await updateContract(crewId, updates);
  await updateCrewDriveFolder(crewId, folders.webViewLink);

  return { crew, links, signLinks };
}

/** Keep the crew record pointing at the folder everything was just filed in. */
async function updateCrewDriveFolder(crewId: string, webViewLink: string): Promise<void> {
  const { adminDb } = await import('./firebase/admin');
  await adminDb().ref(`crew/${crewId}/documents`).update({ driveFolder: webViewLink });
}

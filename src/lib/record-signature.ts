import 'server-only';

// One place where a signed contract becomes fact, whichever route it arrived by
// (signed on a phone at /sign/{token}, or scanned and emailed back). It files
// the PDF in the crew member's Drive contracts folder, updates their record,
// burns the signing token, writes the audit entry and sends the confirmations.

import { adminDb } from './firebase/admin';
import { getProjectName, deriveStatus, INTAKE_PROJECT_NAME } from './crew-db';
import { resolveCrewFolder, uploadToFolder } from './drive';
import { revokeSignToken } from './sign-tokens';
import { sendSignedConfirmation, sendAdminNotice } from './email';
import { logAudit } from './audit';
import type { ContractType, CrewMember, SignatureMethod } from './types';

const LETTER: Record<ContractType, 'A' | 'R'> = { X: 'A', Y: 'R' };

const METHOD_LABEL: Record<SignatureMethod, string> = {
  online: 'signed online',
  email_reply: 'scanned copy received by email',
  manual: 'uploaded by an admin',
};

export interface RecordedSignature {
  driveLink: string;
  driveFileId: string;
  folderId: string;
}

export async function recordSignedContract(params: {
  crew: CrewMember;
  type: ContractType;
  pdfBytes: Uint8Array;
  method: SignatureMethod;
  actor: string; // audit actor: 'crew', 'system', or an admin email
  signerName?: string;
  signerIp?: string;
  receivedFrom?: string;
  reference?: string;
  /** Email the crew member a copy of what we filed. Default true. */
  notifyCrew?: boolean;
}): Promise<RecordedSignature> {
  const { crew, type, pdfBytes, method } = params;
  const letter = LETTER[type];
  const projectName = await getProjectName(crew.projectId);
  const first = crew.personal.firstName;
  const last = crew.personal.lastName;
  const crewName = `${first} ${last}`.trim();
  const fileName = `Contract - ${first} - ${last} - ${letter} - signed.pdf`;

  // 1. File it in the crew member's own contracts folder.
  const folders = await resolveCrewFolder({
    projectName,
    crewName,
    legacyProjectNames: [INTAKE_PROJECT_NAME],
  });
  const upload = await uploadToFolder({
    folderId: folders.contractsId,
    fileName,
    mimeType: 'application/pdf',
    data: pdfBytes,
  });

  // 2. Update the signature record and the overall contract status.
  const key = type === 'X' ? 'contractX' : 'contractY';
  const record = {
    signed: true,
    timestamp: Date.now(),
    driveLink: upload.webViewLink,
    driveFileId: upload.fileId,
    method,
    ...(params.signerName ? { signerName: params.signerName } : {}),
    ...(params.signerIp ? { signerIp: params.signerIp } : {}),
    ...(params.receivedFrom ? { receivedFrom: params.receivedFrom } : {}),
  };
  await adminDb().ref(`crew/${crew.id}/signatures/${key}`).set(record);

  const signedX = type === 'X' ? true : Boolean(crew.signatures?.contractX?.signed);
  const signedY = type === 'Y' ? true : Boolean(crew.signatures?.contractY?.signed);
  const status = deriveStatus(signedX, signedY, crew.contract.status);
  await adminDb().ref(`crew/${crew.id}/contract`).update({ status });
  await adminDb().ref(`crew/${crew.id}`).update({ updatedAt: Date.now() });

  // 3. The link for this contract is now spent, whichever way it was signed.
  await revokeSignToken(
    type === 'X' ? crew.contract.signTokenX : crew.contract.signTokenY,
  );

  await logAudit({
    action: signedX && signedY ? 'contract_both_signed' : `contract_${letter}_signed`,
    actor: params.actor,
    crewId: crew.id,
    projectId: crew.projectId,
    detail: `Contract ${letter} ${METHOD_LABEL[method]} — filed at ${upload.webViewLink}`,
  });

  // 4. Confirmations. Neither may break the signing flow, which has already
  //    succeeded by this point.
  if (params.notifyCrew !== false && crew.personal.email) {
    try {
      await sendSignedConfirmation({
        to: crew.personal.email,
        crewName,
        projectName,
        contractLabel: letter,
        reference: params.reference,
        pdf: { filename: fileName, content: Buffer.from(pdfBytes) },
      });
    } catch (err) {
      console.error('[record-signature] confirmation email failed', err);
    }
  }

  await sendAdminNotice({
    subject: `Contract ${letter} signed — ${crewName} (${projectName})`,
    heading: `${crewName} signed contract ${letter}`,
    lines: [
      `Project: ${projectName}`,
      `How: ${METHOD_LABEL[method]}${params.receivedFrom ? ` from ${params.receivedFrom}` : ''}`,
      `Status now: ${status.replace(/_/g, ' ')}`,
    ],
    link: { url: upload.webViewLink, label: 'Open the signed contract' },
  });

  return {
    driveLink: upload.webViewLink,
    driveFileId: upload.fileId,
    folderId: upload.folderId,
  };
}

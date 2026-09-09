// Shared data model for Bayanati. Mirrors the Firebase Realtime DB structure.

export type Language = 'ar' | 'en';

export type ContractStatus =
  | 'submitted' // crew filled the intake form; no contract yet
  | 'pending' // admin is preparing (role/amounts/dates being set)
  | 'sent' // contracts generated and emailed for signature
  | 'signed_x' // only contract X signed
  | 'signed_y' // only contract Y signed
  | 'both_signed';

export type ContractType = 'X' | 'Y';

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // +971 format
  nationality: string;
  dob: string; // ISO yyyy-mm-dd
}

export interface DocumentRefs {
  emiratesId: string; // 15-digit number, formatted 784-YYYY-NNNNNNN-C
  passport: string; // alphanumeric 6-10
  // Google Drive webViewLinks, filled after upload.
  emiratesIdFront?: string;
  emiratesIdBack?: string;
  passportImage?: string;
  driveFolder?: string;
}

/**
 * Admin overrides for values that are otherwise derived from the crew's intake
 * data (name, project, IDs, nationality). Lets an admin correct exactly what is
 * printed on the contract, without altering the raw intake record. An empty/absent value falls back to the derived source.
 */
export interface ContractFieldOverrides {
  crewName?: string;
  projectName?: string;
  emiratesId?: string;
  passport?: string;
  nationality?: string;
}

export interface ContractDetails {
  status: ContractStatus;
  language: Language;
  role?: string;
  amountX?: number; // AED
  amountY?: number; // AED
  dateFrom?: string; // dd/mm/yyyy or ISO
  dateTo?: string;
  iban?: string; // AE IBAN
  // Admin edits to the contract's filled data (see ContractFieldOverrides).
  overrides?: ContractFieldOverrides;
  sentAt?: number;
  // Google Drive webViewLinks to the generated PDFs (filled on generate OR send,
  // so an admin can review the contracts before sending them out).
  pdfLinkX?: string;
  pdfLinkY?: string;
  // Drive file ids of the same PDFs, so the server can fetch the exact bytes
  // that were emailed when it comes time to apply a signature or a stamp.
  pdfFileIdX?: string;
  pdfFileIdY?: string;
  generatedAt?: number;
  // Self-hosted signing: a one-time token behind {APP_URL}/sign/{token} and the
  // short reference printed in the email subject (used to match a crew member's
  // emailed reply back to the right contract).
  signUrlX?: string;
  signUrlY?: string;
  signTokenX?: string;
  signTokenY?: string;
  signRefX?: string;
  signRefY?: string;
  // Stamped (company seal applied) signed PDFs, filled by /api/contracts/stamp.
  stampLinkX?: string;
  stampLinkY?: string;
  stampedAt?: number;
}

/** How a signed contract reached us. */
export type SignatureMethod =
  | 'online' // signed on the /sign/{token} page (phone or desktop)
  | 'email_reply' // crew replied to the contract email with a scanned PDF
  | 'manual'; // an admin uploaded the scan by hand

export interface SignatureRecord {
  signed: boolean;
  timestamp?: number;
  driveLink?: string;
  driveFileId?: string;
  method?: SignatureMethod;
  signerName?: string; // name typed on the signing page
  signerIp?: string;
  receivedFrom?: string; // sender address, for email replies
}

export interface CrewMember {
  id: string;
  projectId: string;
  personal: PersonalInfo;
  documents: DocumentRefs;
  contract: ContractDetails;
  signatures: {
    contractX: SignatureRecord;
    contractY: SignatureRecord;
  };
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  crewId?: string;
  projectId?: string;
  actor: string; // admin email or 'system' or 'crew'
  detail?: string;
  timestamp: number;
}

// Placeholder set used when filling contract templates.
export interface ContractPlaceholders {
  CREW_NAME: string;
  ROLE: string;
  AMOUNT_X: string;
  AMOUNT_Y: string;
  AMOUNT: string; // resolves to X or Y depending on the contract being rendered
  DATE_FROM: string;
  DATE_TO: string;
  IBAN: string;
  PROJECT_NAME: string;
  EMIRATES_ID: string;
  PASSPORT: string;
  NATIONALITY: string;
  TODAY: string;
}

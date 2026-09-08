// Shared data model for Bayanati. Mirrors the Firebase Realtime DB structure.

export type Language = 'ar' | 'en';

export type ContractStatus =
  | 'submitted' // crew filled the intake form; no contract yet
  | 'pending' // admin is preparing (role/amounts/dates being set)
  | 'sent' // contracts generated + emailed via Docuseal
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

export interface ContractDetails {
  status: ContractStatus;
  language: Language;
  role?: string;
  amountX?: number; // AED
  amountY?: number; // AED
  dateFrom?: string; // dd/mm/yyyy or ISO
  dateTo?: string;
  iban?: string; // AE IBAN
  sentAt?: number;
  // Google Drive webViewLinks to the generated PDFs (filled on generate OR send,
  // so an admin can review the contracts before sending them out).
  pdfLinkX?: string;
  pdfLinkY?: string;
  generatedAt?: number;
  // Docuseal submission ids so we can reconcile webhook events.
  docusealSubmissionX?: string;
  docusealSubmissionY?: string;
  signUrlX?: string;
  signUrlY?: string;
}

export interface SignatureRecord {
  signed: boolean;
  timestamp?: number;
  driveLink?: string;
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

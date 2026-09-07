'use client';

// Client-side crew submission: upload ID images to Firebase Storage, write the
// crew record to the Realtime DB, then ask the server to sync files to Drive and
// log the audit entry. Runs entirely with the Firebase Web SDK (no auth needed
// for intake — Realtime DB rules should allow crew writes only under /crew).

import { ref as dbRef, serverTimestamp, set } from 'firebase/database';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { firebaseDb, firebaseStorage } from './firebase/client';
import type { CrewMember, Language } from './types';

export interface CrewFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
  dob: string;
  emiratesId: string;
  passport: string;
  iban: string;
  language: Language;
  emiratesIdFront: File | null;
  emiratesIdBack: File | null;
  passportImage: File | null;
}

/** crewId = sanitised email + timestamp; safe as a Firebase key. */
export function makeCrewId(email: string): string {
  const slug = email.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${slug}_${Date.now()}`;
}

const INTAKE_PROJECT = '_intake'; // new crew land here until an admin reassigns

// Uploads the file and returns its Storage path (not a download URL). The
// server reads it back via the Admin SDK, so no public read access is needed.
async function uploadOne(
  projectId: string,
  crewId: string,
  file: File,
  name: string,
): Promise<string> {
  const path = `uploads/${projectId}/${crewId}/${name}`;
  const r = storageRef(firebaseStorage(), path);
  await uploadBytes(r, file, { contentType: file.type });
  return path;
}

export async function submitCrew(data: CrewFormData): Promise<string> {
  const crewId = makeCrewId(data.email);
  const projectId = INTAKE_PROJECT;

  // 1. Upload the three ID images in parallel.
  const [frontUrl, backUrl, passportUrl] = await Promise.all([
    data.emiratesIdFront
      ? uploadOne(projectId, crewId, data.emiratesIdFront, 'emirates_id_front.jpg')
      : Promise.resolve<string | undefined>(undefined),
    data.emiratesIdBack
      ? uploadOne(projectId, crewId, data.emiratesIdBack, 'emirates_id_back.jpg')
      : Promise.resolve<string | undefined>(undefined),
    data.passportImage
      ? uploadOne(projectId, crewId, data.passportImage, 'passport.jpg')
      : Promise.resolve<string | undefined>(undefined),
  ]);

  // 2. Write the crew record.
  const record: Omit<CrewMember, 'createdAt' | 'updatedAt'> & {
    createdAt: object;
    updatedAt: object;
  } = {
    id: crewId,
    projectId,
    personal: {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.replace(/\s/g, ''),
      nationality: data.nationality.trim(),
      dob: data.dob,
    },
    documents: {
      emiratesId: data.emiratesId.replace(/\D/g, ''),
      passport: data.passport.trim().toUpperCase(),
      emiratesIdFront: frontUrl,
      emiratesIdBack: backUrl,
      passportImage: passportUrl,
    },
    contract: {
      status: 'submitted',
      language: data.language,
      // IBAN is captured at intake; admin can still edit it before sending.
      iban: data.iban.replace(/\s/g, '').toUpperCase(),
    },
    signatures: {
      contractX: { signed: false },
      contractY: { signed: false },
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await set(dbRef(firebaseDb(), `crew/${crewId}`), record);

  // 3. Fire-and-forget server sync (Drive folders + audit). Failure here must
  //    not block the crew's success screen; the server also logs the error.
  fetch('/api/crew/after-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crewId }),
  }).catch(() => {
    /* best-effort; dashboard has a manual re-sync action */
  });

  return crewId;
}

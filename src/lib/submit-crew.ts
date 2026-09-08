'use client';

// Client-side crew submission. Sends the form fields + the three ID images to
// the server as multipart/form-data; the server validates, uploads the images
// straight to Google Drive, and writes the crew record via the Admin SDK. No
// Firebase Storage and no client-side DB write are involved.

import type { Language } from './types';

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

export async function submitCrew(data: CrewFormData): Promise<string> {
  const fd = new FormData();
  fd.set('firstName', data.firstName);
  fd.set('lastName', data.lastName);
  fd.set('email', data.email);
  fd.set('phone', data.phone);
  fd.set('nationality', data.nationality);
  fd.set('dob', data.dob);
  fd.set('emiratesId', data.emiratesId);
  fd.set('passport', data.passport);
  fd.set('iban', data.iban);
  fd.set('language', data.language);
  if (data.emiratesIdFront) fd.set('emiratesIdFront', data.emiratesIdFront);
  if (data.emiratesIdBack) fd.set('emiratesIdBack', data.emiratesIdBack);
  if (data.passportImage) fd.set('passportImage', data.passportImage);

  const res = await fetch('/api/crew/submit', { method: 'POST', body: fd });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; crewId?: string; error?: string }
    | null;
  if (!res.ok || !json?.ok || !json.crewId) {
    throw new Error(json?.error ?? 'Submission failed. Please try again.');
  }
  return json.crewId;
}

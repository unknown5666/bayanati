import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getProjectName } from '@/lib/crew-db';
import { uploadToDrive } from '@/lib/drive';
import { logAudit } from '@/lib/audit';
import {
  validateDob,
  validateEmail,
  validateEmiratesId,
  validateIban,
  validateImageFile,
  validatePassport,
  validatePhone,
  validateRequired,
} from '@/lib/validation';
import type { Language } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // uploading 3 images to Drive can take a few seconds

// Crew intake (unauthenticated). Receives the form fields + the three ID images
// as multipart/form-data, validates everything server-side, uploads the images
// straight to Google Drive (no Firebase Storage), then writes the crew record
// via the Admin SDK. One hop: browser -> server -> Drive.

const INTAKE_PROJECT = '_intake'; // new crew land here until an admin reassigns

/** crewId = sanitised email + timestamp; safe as a Firebase key. */
function makeCrewId(email: string): string {
  const slug = email.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${slug}_${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const get = (k: string) => (form.get(k) ?? '').toString().trim();

    const firstName = get('firstName');
    const lastName = get('lastName');
    const email = get('email').toLowerCase();
    const phone = get('phone').replace(/\s/g, '');
    const nationality = get('nationality');
    const dob = get('dob');
    const emiratesId = get('emiratesId');
    const passport = get('passport').toUpperCase();
    const iban = get('iban').replace(/\s/g, '').toUpperCase();
    const language: Language = get('language') === 'ar' ? 'ar' : 'en';

    // Server-side validation — never trust the client. First failure wins.
    const bad = [
      validateRequired(firstName, 'First name'),
      validateRequired(lastName, 'Last name'),
      validateEmail(email),
      validatePhone(phone),
      validateRequired(nationality, 'Nationality'),
      validateDob(dob),
      validateEmiratesId(emiratesId),
      validatePassport(passport),
      validateIban(iban),
    ].find((c) => !c.ok);
    if (bad) return NextResponse.json({ error: bad.message }, { status: 400 });

    // The three required ID images.
    const spec: Array<[field: string, driveBase: string]> = [
      ['emiratesIdFront', 'Emirates_ID_Front'],
      ['emiratesIdBack', 'Emirates_ID_Back'],
      ['passportImage', 'Passport'],
    ];
    const files: Array<{ field: string; driveName: string; file: File }> = [];
    for (const [field, driveBase] of spec) {
      const f = form.get(field);
      if (!(f instanceof File) || f.size === 0) {
        return NextResponse.json({ error: `${field} image is required` }, { status: 400 });
      }
      const v = validateImageFile({ type: f.type, size: f.size });
      if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 });
      const ext = f.type === 'image/png' ? 'png' : 'jpg';
      files.push({ field, driveName: `${driveBase}.${ext}`, file: f });
    }

    const crewId = makeCrewId(email);
    const projectId = INTAKE_PROJECT;
    const projectName = await getProjectName(projectId);
    const crewName = `${firstName} ${lastName}`.trim();
    const basePath = ['Projects', projectName, 'Crew', crewName];

    // Upload each image directly to Drive.
    const driveLinks: Record<string, string> = {};
    let folderId: string | undefined;
    for (const u of files) {
      const data = Buffer.from(await u.file.arrayBuffer());
      const res = await uploadToDrive({
        pathSegments: basePath,
        fileName: u.driveName,
        mimeType: u.file.type,
        data,
      });
      folderId = res.folderId;
      driveLinks[u.field] = res.webViewLink;
    }

    // Write the crew record. The Admin SDK bypasses RTDB rules, so intake no
    // longer needs an unauthenticated write path.
    const now = Date.now();
    await adminDb()
      .ref(`crew/${crewId}`)
      .set({
        id: crewId,
        projectId,
        personal: { firstName, lastName, email, phone, nationality, dob },
        documents: {
          emiratesId: emiratesId.replace(/\D/g, ''),
          passport,
          emiratesIdFront: driveLinks.emiratesIdFront ?? null,
          emiratesIdBack: driveLinks.emiratesIdBack ?? null,
          passportImage: driveLinks.passportImage ?? null,
          driveFolder: folderId
            ? `https://drive.google.com/drive/folders/${folderId}`
            : null,
        },
        contract: { status: 'submitted', language, iban },
        signatures: {
          contractX: { signed: false },
          contractY: { signed: false },
        },
        createdAt: now,
        updatedAt: now,
      });

    await logAudit({
      action: 'crew_submitted',
      actor: 'crew',
      crewId,
      projectId,
      detail: `Uploaded ${files.length} document(s) to Drive`,
    });

    return NextResponse.json({ ok: true, crewId });
  } catch (err) {
    console.error('[crew/submit] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Submission failed' },
      { status: 500 },
    );
  }
}

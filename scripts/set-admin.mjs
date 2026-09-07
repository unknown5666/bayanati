// Grants the `admin` custom claim to every email in ADMIN_EMAILS.
// Optional backup for the auto-grant in /api/auth/session — run it if you want
// claims set before anyone logs in.
//
// Usage:
//   node --env-file=.env.local scripts/set-admin.mjs
//
// The users must already exist in Firebase Auth (create them in the console, or
// let them sign in once with Google, first).

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const auth = getAuth(app);
const emails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

if (emails.length === 0) {
  console.error('ADMIN_EMAILS is empty.');
  process.exit(1);
}

for (const email of emails) {
  try {
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, { admin: true });
    console.log(`✓ admin granted to ${email}`);
  } catch (err) {
    console.error(`✗ ${email}: ${err.message}`);
  }
}

process.exit(0);

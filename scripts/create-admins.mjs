// Creates Bayanati admin users (email/password sign-in) and grants each the
// `admin` custom claim, then prints a secure "set your password" link for each
// so every admin chooses their own password. No passwords are set by this
// script.
//
// Usage:
//   node --env-file=.env.local scripts/create-admins.mjs saad@example.com abdullah@example.com
//
// If no emails are passed on the command line, it falls back to ADMIN_EMAILS.
// After running, add the same emails to ADMIN_EMAILS in .env.local (if not
// already there) and send each person their link. Opening the link lets them
// set a password; then they sign in at /auth/login.

import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyPath) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is not set.');
  process.exit(1);
}
const key = JSON.parse(readFileSync(keyPath, 'utf8'));
const app = initializeApp({
  credential: cert({
    projectId: key.project_id,
    clientEmail: key.client_email,
    privateKey: key.private_key,
  }),
});
const auth = getAuth(app);

const emails = (
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : (process.env.ADMIN_EMAILS ?? '').split(',')
)
  .map((e) => e.trim())
  .filter(Boolean);

if (emails.length === 0) {
  console.error('Pass admin emails as arguments, or set ADMIN_EMAILS.');
  process.exit(1);
}

for (const email of emails) {
  try {
    let user;
    try {
      user = await auth.getUserByEmail(email);
      console.log(`• ${email} already exists`);
    } catch {
      user = await auth.createUser({ email, emailVerified: false });
      console.log(`• ${email} created`);
    }
    await auth.setCustomUserClaims(user.uid, { admin: true });
    const link = await auth.generatePasswordResetLink(email);
    console.log(`  admin claim granted. Set-password link:\n  ${link}\n`);
  } catch (err) {
    console.error(`✗ ${email}: ${err.message}`);
  }
}

process.exit(0);

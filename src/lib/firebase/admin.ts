import 'server-only';

// Firebase Admin SDK for server code (API routes). Initialised lazily so that
// importing this module during `next build` (page-data collection) does not
// require credentials — they're only needed when a handler actually runs.
// Never import this into a client component.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getAuth, type Auth } from 'firebase-admin/auth';

let cachedApp: App | undefined;

/**
 * Resolve service-account credentials from either:
 *  1. FIREBASE_SERVICE_ACCOUNT_KEY — path to the downloaded JSON key file, or
 *  2. FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY — three inline vars.
 */
function resolveCredential(): ServiceAccount {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (keyPath) {
    const abs = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
    try {
      const json = JSON.parse(readFileSync(abs, 'utf8'));
      return {
        projectId: json.project_id,
        clientEmail: json.client_email,
        privateKey: json.private_key,
      };
    } catch (err) {
      throw new Error(
        `Could not read FIREBASE_SERVICE_ACCOUNT_KEY at ${abs}: ` +
          (err instanceof Error ? err.message : 'unknown error'),
      );
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Private keys pasted into env keep literal "\n"; restore real newlines.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_KEY ' +
        '(path to the JSON key) or FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY.',
    );
  }
  return { projectId, clientEmail, privateKey };
}

function app(): App {
  if (cachedApp) return cachedApp;
  if (getApps().length) {
    cachedApp = getApp();
    return cachedApp;
  }

  cachedApp = initializeApp({
    credential: cert(resolveCredential()),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  return cachedApp;
}

export function adminDb(): Database {
  return getDatabase(app());
}

export function adminAuth(): Auth {
  return getAuth(app());
}

// Fallback admin allow-list so the dashboard works even if the ADMIN_EMAILS env
// var was never set (or got wiped) on the host — same defensive pattern as the
// public Firebase config fallbacks. These are not secrets: knowing an admin
// email grants nothing without that account's Google/password credentials.
const FALLBACK_ADMIN_EMAILS = ['iamnotness46@gmail.com'];

/**
 * Emails allowed into the dashboard: the built-in owner list UNION whatever the
 * ADMIN_EMAILS env var lists (comma-separated). Union — not "env overrides
 * built-in" — so a missing, empty, OR wrongly-set ADMIN_EMAILS can never lock
 * the owner out. Add more admins via the env var; the owner is always allowed.
 */
export function adminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...FALLBACK_ADMIN_EMAILS, ...fromEnv]));
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/**
 * Verify a Firebase ID token from an Authorization: Bearer header and confirm
 * the caller is a whitelisted admin. Throws on any failure.
 */
export async function requireAdmin(authHeader?: string | null): Promise<{
  uid: string;
  email: string;
}> {
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;
  if (!token) throw new Error('Missing bearer token');

  const decoded = await adminAuth().verifyIdToken(token);
  if (!isAdminEmail(decoded.email)) {
    throw new Error('Not an authorised admin');
  }
  return { uid: decoded.uid, email: decoded.email! };
}

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
 * Turn whatever a host control panel stored back into a valid PEM private key.
 * Handles, in order: undefined/empty, surrounding single/double quotes,
 * escaped newlines ("\n" and double-escaped "\\n"), CRLF, and the common case
 * where the panel stripped ALL newlines leaving a single-line PEM — in which
 * case we re-wrap the base64 body at 64 chars between the BEGIN/END markers.
 */
function normalizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();

  // Strip a single layer of wrapping quotes if the panel kept them.
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // Restore real newlines from escaped forms, then normalise CRLF.
  key = key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // If newlines were stripped entirely (one long line), rebuild the PEM.
  if (key.includes('BEGIN') && !key.includes('\n')) {
    const m = key.match(/-----BEGIN ([A-Z ]+?)-----(.*?)-----END \1-----/);
    if (m) {
      const label = m[1].trim();
      const body = m[2].replace(/\s+/g, '');
      const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
      key = `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
    }
  }

  // Ensure a trailing newline after the END marker (cert() is picky).
  if (!key.endsWith('\n')) key += '\n';
  return key;
}

/**
 * Resolve service-account credentials from either:
 *  1. FIREBASE_SERVICE_ACCOUNT_KEY — path to the downloaded JSON key file, or
 *  2. FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY — three inline vars.
 */
function resolveCredential(): ServiceAccount {
  // 0. FIREBASE_SERVICE_ACCOUNT_BASE64 — the whole service-account JSON, base64
  //    encoded, in a single env var. Base64 has no newlines/quotes/PEM markers
  //    for a control panel to mangle, so this is the most robust option when a
  //    host keeps corrupting a pasted multi-line private key.
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    try {
      const json = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
      return {
        projectId: json.project_id,
        clientEmail: json.client_email,
        privateKey: json.private_key,
      };
    } catch (err) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_BASE64 is set but is not valid base64-encoded ' +
          'JSON: ' + (err instanceof Error ? err.message : 'unknown error'),
      );
    }
  }

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
  // Host panels mangle pasted PEM keys in several ways; normalise them all.
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
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

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY diagnostic endpoint. Reports the SHAPE of the Firebase Admin
// credential env vars (never the secret itself) plus whether cert() can parse
// the key, so a production credential problem can be diagnosed without SSH.
// Remove once the intake path is confirmed working.

// A build marker so we can confirm which commit is actually live.
const BUILD_MARKER = '616c215+health1';

function keyShape(raw: string | undefined) {
  if (!raw) return { present: false };
  const trimmed = raw.trim();
  return {
    present: true,
    length: raw.length,
    startsWithQuote: /^["']/.test(trimmed),
    endsWithQuote: /["']$/.test(trimmed),
    hasBegin: raw.includes('BEGIN'),
    hasEnd: raw.includes('END'),
    hasRealNewline: raw.includes('\n'),
    hasEscapedNewline: raw.includes('\\n'),
    hasDoubleEscaped: raw.includes('\\\\n'),
    hasCR: raw.includes('\r'),
    // First 40 chars only — the header is not secret; the key body is untouched.
    head: raw.slice(0, 40),
    tail: raw.slice(-40),
  };
}

export async function GET() {
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const out: Record<string, unknown> = {
    buildMarker: BUILD_MARKER,
    node: process.version,
    env: {
      FIREBASE_SERVICE_ACCOUNT_BASE64: !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      FIREBASE_SERVICE_ACCOUNT_KEY: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      FIREBASE_ADMIN_PROJECT_ID: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
      FIREBASE_ADMIN_CLIENT_EMAIL: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      FIREBASE_ADMIN_PRIVATE_KEY: !!rawKey,
      DATABASE_URL: !!process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      GOOGLE_DRIVE_CLIENT_ID: !!process.env.GOOGLE_DRIVE_CLIENT_ID,
      GOOGLE_DRIVE_REFRESH_TOKEN: !!process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      GOOGLE_DRIVE_ROOT_FOLDER_ID: !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    },
    privateKeyShape: keyShape(rawKey),
  };

  // Try to actually initialise Firebase Admin and report the precise failure.
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    // getDatabase() forces credential resolution + cert() parsing.
    adminDb();
    out.firebaseInit = 'ok';
  } catch (err) {
    out.firebaseInit = 'failed';
    out.firebaseError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(out);
}

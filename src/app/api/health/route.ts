import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY diagnostic endpoint. Reports the SHAPE of the Firebase Admin
// credential env vars (never the secret itself) plus whether cert() can parse
// the key, so a production credential problem can be diagnosed without SSH.
// Remove once the intake path is confirmed working.

// A build marker so we can confirm which commit is actually live.
const BUILD_MARKER = '616c215+health2';

/**
 * Report the SHAPE of the base64 service-account var without leaking the secret.
 * The non-secret JSON header ({"type":"service_account","project_id":...}) is
 * safe to echo; the private_key lives deep in the object and is never shown.
 */
function base64Shape(raw: string | undefined) {
  if (!raw) return { present: false };
  const trimmed = raw.trim();
  const info: Record<string, unknown> = {
    present: true,
    length: raw.length,
    head8: trimmed.slice(0, 8), // correct value starts "eyJ0eXBl"
    tail4: trimmed.slice(-4),
    startsWithQuote: /^["']/.test(trimmed),
    startsWithPrefix: /^FIREBASE_SERVICE_ACCOUNT_BASE64\s*=/i.test(trimmed),
    hasWhitespaceInside: /\s/.test(trimmed),
    firstCharCode: trimmed.charCodeAt(0), // 65279 = BOM, 34 = ", 70 = 'F'
  };
  try {
    const clean = trimmed.replace(/\s+/g, '');
    const decoded = Buffer.from(clean, 'base64').toString('utf8');
    info.decodedHead30 = decoded.slice(0, 30); // expect '{"type": "service_account"'
    info.decodedFirstCharCode = decoded.charCodeAt(0); // 123 = '{'
  } catch (err) {
    info.decodeError = err instanceof Error ? err.message : String(err);
  }
  return info;
}

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
    base64Shape: base64Shape(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64),
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

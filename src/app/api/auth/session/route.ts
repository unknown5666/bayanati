import { NextResponse } from 'next/server';
import { adminAuth, isAdminEmail } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

// Verifies the caller's Firebase ID token. If their email is on the ADMIN_EMAILS
// whitelist and they don't yet have the `admin` custom claim, it's granted here
// (so Realtime DB rules that check auth.token.admin start working). The client
// then force-refreshes its token to pick up the claim.

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;
  if (!token) return NextResponse.json({ isAdmin: false }, { status: 401 });

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  const email = decoded.email ?? '';
  const whitelisted = isAdminEmail(email);

  if (whitelisted && decoded.admin !== true) {
    await adminAuth().setCustomUserClaims(decoded.uid, { admin: true });
    return NextResponse.json({ isAdmin: true, email, claimUpdated: true });
  }

  return NextResponse.json({ isAdmin: whitelisted, email, claimUpdated: false });
}

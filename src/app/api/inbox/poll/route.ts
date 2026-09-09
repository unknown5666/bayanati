import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/firebase/admin';
import { inboxConfigured, pollInbox } from '@/lib/inbox';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // IMAP + several Drive uploads

// Reads the contracts mailbox and files any signed scans that came back.
//
// Two ways in:
//   • an admin from the dashboard  — Authorization: Bearer <firebase id token>
//   • a scheduler                  — ?key=INBOX_POLL_SECRET  (GET or POST)
//
// Idempotent: replies already handled are recorded under /inboxProcessed, so
// polling every few minutes is safe.

async function authorise(req: Request): Promise<{ actor: string } | null> {
  const secret = process.env.INBOX_POLL_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const provided = url.searchParams.get('key') ?? req.headers.get('x-poll-key');
    if (provided && provided === secret) return { actor: 'system' };
  }
  try {
    const admin = await requireAdmin(req.headers.get('authorization'));
    return { actor: admin.email };
  } catch {
    return null;
  }
}

async function handle(req: Request) {
  const auth = await authorise(req);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!inboxConfigured()) {
    return NextResponse.json(
      {
        error:
          'Inbox polling is not configured. Set IMAP_HOST, IMAP_USER and IMAP_PASS ' +
          '(or the matching SMTP_* values) in the app environment.',
      },
      { status: 400 },
    );
  }

  try {
    const result = await pollInbox();
    if (result.filed || result.rejected || result.unmatched) {
      await logAudit({
        action: 'inbox_polled',
        actor: auth.actor,
        detail:
          `Scanned ${result.scanned} · filed ${result.filed} · ` +
          `rejected ${result.rejected} · unmatched ${result.unmatched}`,
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[inbox/poll] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Inbox poll failed' },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;

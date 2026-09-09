import 'server-only';

// The background watch on the contracts mailbox, started once per server boot by
// ./instrumentation.ts. It is what makes "reply with your signed scan and it
// gets filed" work with nobody pressing anything.
//
// Set INBOX_POLL_INTERVAL_MINUTES=0 to turn it off — for example if you would
// rather drive /api/inbox/poll?key=... from a real cron job, which is the better
// option if the app ever runs more than one instance.

const DEFAULT_INTERVAL_MINUTES = 5;
const FIRST_RUN_DELAY_MS = 45_000;

let started = false;

export async function startInboxWatcher(): Promise<void> {
  if (started) return; // a hot reload must not stack up a second timer
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const configured = process.env.INBOX_POLL_INTERVAL_MINUTES;
  const minutes = configured === undefined ? DEFAULT_INTERVAL_MINUTES : Number(configured);
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  const { inboxConfigured, pollInbox } = await import('./lib/inbox');
  if (!inboxConfigured()) {
    console.warn(
      '[inbox] automatic polling is off: set IMAP_HOST/IMAP_USER/IMAP_PASS ' +
        '(or the SMTP_* equivalents) to have emailed contract scans filed automatically.',
    );
    return;
  }

  let running = false;
  const tick = async () => {
    if (running) return; // a slow poll must not stack up behind itself
    running = true;
    try {
      const result = await pollInbox();
      if (result.filed || result.rejected || result.unmatched) {
        console.log(
          `[inbox] scanned ${result.scanned} · filed ${result.filed} · ` +
            `rejected ${result.rejected} · unmatched ${result.unmatched}`,
        );
      }
      for (const e of result.errors) console.error('[inbox]', e);
    } catch (err) {
      // Never let a mailbox problem take the web server down with it.
      console.error('[inbox] poll failed', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  started = true;
  console.log(`[inbox] watching the contracts mailbox every ${minutes} min`);
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref?.();
  setInterval(tick, minutes * 60_000).unref?.();
}

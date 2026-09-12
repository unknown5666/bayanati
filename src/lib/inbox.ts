import 'server-only';

// Watches the contracts mailbox for crew replies and files the scans they send.
//
// When a contract goes out, its email subject carries a short reference
// (`[OEP-7KX4Q2]`). Replying keeps that subject, so the reference tells us which
// contract the attachment belongs to; if it has been stripped, we fall back to
// matching the sender's address against the crew list.
//
// Only a real PDF is accepted as a signed contract — the magic bytes are
// checked, not the filename — because a phone photo is not a document of
// record. A reply that carries only images gets a polite "scanned PDF only"
// answer and is NOT filed.
//
// Nothing here runs on its own: call `pollInbox()` from /api/inbox/poll (a cron
// job, the dashboard button, or the in-process scheduler in instrumentation.ts).

import { createHash } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser, type Attachment, type ParsedMail } from 'mailparser';
import { adminDb } from './firebase/admin';
import { logAudit } from './audit';
import { sendAdminNotice, sendScanRejectedEmail } from './email';
import { recordSignedContract } from './record-signature';
import { findRefIn, lookupSignRef } from './sign-tokens';
import { looksLikePdf } from './sign-pdf';
import type { ContractType, CrewMember } from './types';

const LETTER: Record<ContractType, 'A' | 'R'> = { X: 'A', Y: 'R' };

/** Largest attachment we will pull out of a mailbox. Scans are ~1–5 MB. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * How many recent messages to look at per poll. Only their envelopes are read,
 * so this stays cheap; it is deliberately far larger than the number we will
 * download, so an unprocessed reply cannot fall out of the window behind a run
 * of unrelated mail.
 */
const CANDIDATE_SCAN_LIMIT = 200;

export interface InboxConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  processedMailbox?: string;
}

/**
 * IMAP settings, defaulting to the SMTP mailbox we send from — on Hostinger
 * that is the same account on `imap.` instead of `smtp.`, so a working send
 * config usually needs no extra variables.
 */
export function inboxConfig(): InboxConfig {
  const smtpHost = process.env.SMTP_HOST ?? '';
  const host =
    process.env.IMAP_HOST ??
    (smtpHost.startsWith('smtp.') ? `imap.${smtpHost.slice('smtp.'.length)}` : smtpHost);
  const user = process.env.IMAP_USER ?? process.env.SMTP_USER ?? '';
  const pass = process.env.IMAP_PASS ?? process.env.SMTP_PASS ?? '';
  if (!host || !user || !pass) {
    throw new Error(
      'Inbox polling is not configured. Set IMAP_HOST, IMAP_USER and IMAP_PASS ' +
        '(or rely on SMTP_HOST/SMTP_USER/SMTP_PASS for the same mailbox).',
    );
  }
  return {
    host,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_SECURE !== 'false',
    user,
    pass,
    mailbox: process.env.IMAP_MAILBOX ?? 'INBOX',
    processedMailbox: process.env.IMAP_PROCESSED_MAILBOX || undefined,
  };
}

export function inboxConfigured(): boolean {
  try {
    inboxConfig();
    return true;
  } catch {
    return false;
  }
}

export type ReplyOutcome =
  | 'filed' // a scanned PDF was accepted and filed
  | 'rejected' // images only — we replied asking for a PDF
  | 'unmatched' // could not tell which contract this belongs to
  | 'ignored'; // a reply with nothing to file (a plain "thanks", etc.)

export interface InboxPollResult {
  ok: boolean;
  scanned: number;
  filed: number;
  rejected: number;
  unmatched: number;
  ignored: number;
  messages: Array<{
    from: string;
    subject: string;
    outcome: ReplyOutcome;
    crewId?: string;
    contract?: 'A' | 'R';
    note?: string;
  }>;
  errors: string[];
}

/**
 * RTDB-safe key for a message, so the same reply is never processed twice. Built
 * from the Message-ID, which the envelope carries — no need to download the
 * message body just to find out we have already handled it.
 */
function messageKey(messageId: string | undefined | null, fallbackSeed: string): string {
  return createHash('sha1').update(messageId || fallbackSeed).digest('hex');
}

async function alreadyProcessed(key: string): Promise<boolean> {
  const snap = await adminDb().ref(`inboxProcessed/${key}`).get();
  return snap.exists();
}

async function markProcessed(key: string, detail: Record<string, unknown>): Promise<void> {
  await adminDb().ref(`inboxProcessed/${key}`).set({ at: Date.now(), ...detail });
}

function senderAddress(parsed: ParsedMail): string {
  const from = parsed.from?.value?.[0];
  return (from?.address ?? '').toLowerCase();
}

function senderName(parsed: ParsedMail): string {
  return parsed.from?.value?.[0]?.name ?? '';
}

/** PDF attachments that really are PDFs, largest first (the scan, not a logo). */
export function pdfAttachments(parsed: ParsedMail): Attachment[] {
  return parsed.attachments
    .filter((a) => {
      if (!a.content || a.size > MAX_ATTACHMENT_BYTES) return false;
      const byType = (a.contentType ?? '').toLowerCase() === 'application/pdf';
      const byName = /\.pdf$/i.test(a.filename ?? '');
      if (!byType && !byName) return false;
      return looksLikePdf(new Uint8Array(a.content));
    })
    .sort((a, b) => b.size - a.size);
}

/** Attachments that are pictures — the case we have to reject and explain. */
export function imageAttachments(parsed: ParsedMail): Attachment[] {
  return parsed.attachments.filter((a) => {
    const type = (a.contentType ?? '').toLowerCase();
    if (type.startsWith('image/')) return true;
    return /\.(jpe?g|png|heic|heif|gif|webp|tiff?|bmp)$/i.test(a.filename ?? '');
  });
}

/** Every crew record, keyed by lowercase email — the fallback matcher. */
async function crewByEmail(): Promise<Map<string, CrewMember[]>> {
  const snap = await adminDb().ref('crew').get();
  const map = new Map<string, CrewMember[]>();
  if (!snap.exists()) return map;
  const all = snap.val() as Record<string, CrewMember>;
  for (const crew of Object.values(all)) {
    const email = crew?.personal?.email?.toLowerCase();
    if (!email) continue;
    const list = map.get(email) ?? [];
    list.push(crew);
    map.set(email, list);
  }
  return map;
}

/** Contracts that were sent to this crew member and are still unsigned. */
function awaitingSignature(crew: CrewMember): ContractType[] {
  const out: ContractType[] = [];
  if (crew.contract.signUrlX && !crew.signatures?.contractX?.signed) out.push('X');
  if (crew.contract.signUrlY && !crew.signatures?.contractY?.signed) out.push('Y');
  return out;
}

interface Target {
  crew: CrewMember;
  type: ContractType;
  reference?: string;
}

/**
 * Work out which contract a reply is about: the reference in the subject (or
 * anywhere in the quoted body) first, then the sender's address — but only when
 * exactly one of their contracts is still awaiting a signature, since guessing
 * between two would file the wrong document.
 */
async function resolveTarget(
  parsed: ParsedMail,
  byEmail: Map<string, CrewMember[]>,
  getCrew: (id: string) => Promise<CrewMember | null>,
): Promise<{ target?: Target; note?: string }> {
  const ref = findRefIn(parsed.subject) ?? findRefIn(parsed.text);
  if (ref) {
    const hit = await lookupSignRef(ref);
    if (hit) {
      const crew = await getCrew(hit.crewId);
      if (crew) return { target: { crew, type: hit.type, reference: ref } };
    }
    return { note: `Reference ${ref} does not match any contract we sent.` };
  }

  const address = senderAddress(parsed);
  const candidates = byEmail.get(address) ?? [];
  if (candidates.length === 0) {
    return { note: `No crew member on file for ${address || 'an unknown sender'}.` };
  }

  const pending = candidates.flatMap((crew) =>
    awaitingSignature(crew).map((type) => ({ crew, type })),
  );
  if (pending.length === 1) return { target: pending[0] };
  if (pending.length === 0) {
    return { note: `${address} has no contract awaiting a signature.` };
  }
  return {
    note:
      `${address} has ${pending.length} contracts awaiting signature and the reply ` +
      'carried no reference, so it could not be matched automatically.',
  };
}

/**
 * Read the mailbox and act on every unprocessed reply. Safe to call as often as
 * you like: each message is recorded under /inboxProcessed once handled, so a
 * second run is a no-op rather than a duplicate filing.
 */
export async function pollInbox(
  opts: { limit?: number; sinceDays?: number } = {},
): Promise<InboxPollResult> {
  const config = inboxConfig();
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const sinceDays = Math.min(Math.max(opts.sinceDays ?? 30, 1), 365);

  const result: InboxPollResult = {
    ok: true,
    scanned: 0,
    filed: 0,
    rejected: 0,
    unmatched: 0,
    ignored: 0,
    messages: [],
    errors: [],
  };

  // Imported lazily so a crew-facing request never pays for the crew map.
  const { getCrew } = await import('./crew-db');
  const byEmail = await crewByEmail();
  const ourAddress = config.user.toLowerCase();

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox);
  const handledUids: number[] = [];

  try {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const found = await client.search({ since }, { uid: true });
    // Envelopes only, in one round trip: enough to tell what we have already
    // handled and who sent it, without pulling megabytes of scans off the
    // server. Newest first, so a burst of unrelated mail can never bury an
    // older reply we have not dealt with yet.
    const candidates = (found || []).slice(-CANDIDATE_SCAN_LIMIT).reverse();
    const envelopes = candidates.length
      ? await client.fetchAll(candidates, { uid: true, envelope: true }, { uid: true })
      : [];
    const byUid = new Map(envelopes.map((m) => [m.uid, m]));

    for (const uid of candidates) {
      if (result.scanned >= limit) break;

      const envelope = byUid.get(uid)?.envelope;
      const envelopeFrom = (envelope?.from?.[0]?.address ?? '').toLowerCase();
      // Never act on our own outgoing mail (some hosts copy it into INBOX).
      if (envelopeFrom && envelopeFrom === ourAddress) continue;

      const key = messageKey(
        envelope?.messageId,
        `${uid}:${envelope?.subject ?? ''}:${envelope?.date ?? ''}`,
      );
      if (await alreadyProcessed(key)) continue;

      // Only now is it worth downloading the message itself.
      let parsed: ParsedMail;
      try {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) continue;
        parsed = await simpleParser(message.source);
      } catch (err) {
        result.errors.push(
          `Could not read message ${uid}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
        continue;
      }

      result.scanned++;
      const subject = parsed.subject ?? '(no subject)';
      // Prefer the envelope's address, but fall back to the parsed headers if a
      // server returned a thin envelope — we reply to this address.
      const from = envelopeFrom || senderAddress(parsed);
      if (from && from === ourAddress) continue;

      const pdfs = pdfAttachments(parsed);
      const images = imageAttachments(parsed);
      if (pdfs.length === 0 && images.length === 0) {
        // A plain reply with nothing attached: leave it for a human to read.
        result.ignored++;
        result.messages.push({ from, subject, outcome: 'ignored' });
        await markProcessed(key, { from, subject, outcome: 'ignored' });
        continue;
      }

      const { target, note } = await resolveTarget(parsed, byEmail, getCrew);

      // --- Images only: reject and explain ---------------------------------
      if (pdfs.length === 0) {
        const names = images.map((a) => a.filename ?? 'image').slice(0, 5);
        try {
          await sendScanRejectedEmail({
            to: from,
            crewName:
              target?.crew.personal.firstName ?? senderName(parsed) ?? 'there',
            contractLabel: target ? LETTER[target.type] : undefined,
            reference: target?.reference,
            signUrl: target
              ? target.type === 'X'
                ? target.crew.contract.signUrlX
                : target.crew.contract.signUrlY
              : undefined,
            received: names,
          });
        } catch (err) {
          result.errors.push(
            `Could not reply to ${from}: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
        }
        await logAudit({
          action: 'contract_reply_rejected',
          actor: 'system',
          crewId: target?.crew.id,
          detail: `Reply from ${from} carried ${names.join(', ')} — pictures are not accepted, asked for a scanned PDF`,
        });
        result.rejected++;
        result.messages.push({
          from,
          subject,
          outcome: 'rejected',
          crewId: target?.crew.id,
          contract: target ? LETTER[target.type] : undefined,
          note: 'Pictures instead of a scanned PDF',
        });
        await markProcessed(key, { from, subject, outcome: 'rejected' });
        handledUids.push(uid);
        continue;
      }

      // --- A PDF, but we cannot tell which contract it is ------------------
      if (!target) {
        result.unmatched++;
        result.messages.push({ from, subject, outcome: 'unmatched', note });
        await logAudit({
          action: 'contract_reply_unmatched',
          actor: 'system',
          detail: `PDF from ${from} ("${subject}") could not be matched: ${note ?? 'no reference'}`,
        });
        await sendAdminNotice({
          subject: 'A signed contract could not be matched',
          heading: 'A reply with a PDF arrived that we could not file',
          lines: [
            `From: ${from}`,
            `Subject: ${subject}`,
            note ?? 'No reference was found in the subject.',
            'The email is still in the contracts mailbox — file it from the dashboard, or ask the crew member to reply keeping the original subject line.',
          ],
        });
        await markProcessed(key, { from, subject, outcome: 'unmatched' });
        continue;
      }

      // --- File the scan ----------------------------------------------------
      try {
        await recordSignedContract({
          crew: target.crew,
          type: target.type,
          pdfBytes: new Uint8Array(pdfs[0].content),
          method: 'email_reply',
          actor: 'crew',
          receivedFrom: from,
          reference: target.reference,
        });
        result.filed++;
        result.messages.push({
          from,
          subject,
          outcome: 'filed',
          crewId: target.crew.id,
          contract: LETTER[target.type],
        });
        await markProcessed(key, {
          from,
          subject,
          outcome: 'filed',
          crewId: target.crew.id,
          type: target.type,
        });
        handledUids.push(uid);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        result.errors.push(`Could not file the scan from ${from}: ${message}`);
        result.ok = false;
        // Left unmarked on purpose — the next poll retries it.
      }
    }

    // Tidy up what we handled: flag it read, and move it aside if configured.
    if (handledUids.length) {
      await client
        .messageFlagsAdd(handledUids, ['\\Seen'], { uid: true })
        .catch(() => undefined);
      if (config.processedMailbox) {
        try {
          await client.mailboxCreate(config.processedMailbox).catch(() => undefined);
          await client.messageMove(handledUids, config.processedMailbox, { uid: true });
        } catch (err) {
          console.error('[inbox] could not move handled messages', err);
        }
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }

  return result;
}

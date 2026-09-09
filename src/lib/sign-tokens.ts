import 'server-only';

// One-time signing tokens — the replacement for Docuseal submissions.
//
// Every contract we email carries two identifiers:
//
//   token — a long random secret behind {APP_URL}/sign/{token}. Whoever holds
//           the link can view that one contract and sign it once. Stored at
//           /signTokens/{token}.
//   ref   — a short human-readable code (e.g. "OEP-7KX4Q2") printed in the
//           email subject. When the crew member replies with a scanned copy,
//           the reply keeps the subject, so the ref tells us which contract the
//           attachment belongs to. Stored at /signRefs/{ref}.
//
// Neither node is world-readable (see database.rules.json); everything goes
// through the Admin SDK on the server.

import { randomBytes } from 'node:crypto';
import { adminDb } from './firebase/admin';
import type { ContractType } from './types';

/** Tokens stop working after this long. Contracts do get signed late — be generous. */
const TOKEN_TTL_DAYS = 120;

export interface SignTokenRecord {
  token: string;
  ref: string;
  crewId: string;
  type: ContractType;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  usedAt?: number;
}

/** Crockford-ish base32 without vowels or look-alikes (no 0/O, 1/I/L, U). */
const REF_ALPHABET = '23456789ACDEFGHJKMNPQRTVWXYZ';

function randomRef(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return `OEP-${out}`;
}

function randomToken(): string {
  return randomBytes(24).toString('base64url');
}

/** The `[OEP-XXXXXX]` tag we put in the email subject so replies stay matchable. */
export function refTag(ref: string): string {
  return `[${ref}]`;
}

/**
 * Pull a signing ref out of arbitrary text (an email subject or body). Matches
 * the bracketed tag and the bare code alike, since forwarding clients sometimes
 * strip the brackets.
 */
export function findRefIn(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.toUpperCase().match(/OEP-[23456789ACDEFGHJKMNPQRTVWXYZ]{6}/);
  return m ? m[0] : null;
}

/** Mint a fresh token+ref pair for one contract and index both. */
export async function createSignToken(params: {
  crewId: string;
  type: ContractType;
}): Promise<SignTokenRecord> {
  const now = Date.now();
  const record: SignTokenRecord = {
    token: randomToken(),
    ref: randomRef(),
    crewId: params.crewId,
    type: params.type,
    createdAt: now,
    expiresAt: now + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    used: false,
  };
  const db = adminDb();
  await db.ref(`signTokens/${record.token}`).set(record);
  await db.ref(`signRefs/${record.ref}`).set({
    crewId: record.crewId,
    type: record.type,
    token: record.token,
    createdAt: now,
  });
  return record;
}

export type TokenLookup =
  | { ok: true; record: SignTokenRecord }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' };

/** Resolve a signing token, reporting *why* it is unusable rather than throwing. */
export async function lookupSignToken(token: string): Promise<TokenLookup> {
  if (!token || token.length > 128) return { ok: false, reason: 'not_found' };
  const snap = await adminDb().ref(`signTokens/${token}`).get();
  if (!snap.exists()) return { ok: false, reason: 'not_found' };
  const record = snap.val() as SignTokenRecord;
  if (record.used) return { ok: false, reason: 'used' };
  if (record.expiresAt && record.expiresAt < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, record };
}

/** Resolve the short reference from an email subject back to a contract. */
export async function lookupSignRef(
  ref: string,
): Promise<{ crewId: string; type: ContractType; token: string } | null> {
  const snap = await adminDb().ref(`signRefs/${ref.toUpperCase()}`).get();
  if (!snap.exists()) return null;
  return snap.val() as { crewId: string; type: ContractType; token: string };
}

/**
 * Burn a token so the same link cannot be signed twice. Returns false if it was
 * already used — the caller should treat that as "someone beat you to it"
 * rather than an error, which also makes double-submits from a flaky phone
 * connection harmless.
 */
export async function consumeSignToken(token: string): Promise<boolean> {
  const ref = adminDb().ref(`signTokens/${token}`);
  const result = await ref.transaction((current: SignTokenRecord | null) => {
    if (!current) return current; // nothing to burn
    if (current.used) return; // abort — already consumed
    return { ...current, used: true, usedAt: Date.now() };
  });
  return result.committed && Boolean(result.snapshot.val()?.used);
}

/** Invalidate the token for a contract that was signed some other way. */
export async function revokeSignToken(token?: string | null): Promise<void> {
  if (!token) return;
  await adminDb()
    .ref(`signTokens/${token}`)
    .update({ used: true, usedAt: Date.now() })
    .catch(() => {
      /* the token may already be gone; nothing to do */
    });
}

export function signUrlFor(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  return `${base}/sign/${token}`;
}

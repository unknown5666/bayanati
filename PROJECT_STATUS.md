# Bayanati — Status & Plan

_Last updated: 2026-09-09_

Crew intake + contract automation for **Over Exposure Productions**.
Next.js 14 (App Router, TS, Tailwind) + Firebase (Realtime DB + Auth) +
Google Drive, with signing handled in-house over email. Bilingual AR/EN with RTL.

**Repo:** https://github.com/unknown5666/bayanati (`main`)
**Live app:** https://bayanati.productionsuae.com — **Hostinger web-app hosting**
(deploys from the GitHub repo; Node 18.20.8)

---

## 🔄 This session: Docuseal removed, signing moved in-house

Docuseal is gone — the library, the webhook route, the Render blueprint and all
`DOCUSEAL_*` variables. Contracts are now emailed **with the PDF attached**, and
there are two ways to sign, both of which file the signed copy in Drive by
themselves:

1. **Sign on a phone.** Every contract email carries a one-time link to
   `/sign/{token}`. The crew member reads the PDF, draws a signature with their
   finger, types their name and confirms. The drawing is stamped into the
   signature box of the exact PDF that was emailed, with an attestation line
   (name · time · IP · reference), and filed under
   `Projects/{PROJECT}/Contracts/Signed/{CREW}/`.
2. **Print, sign, scan, reply.** The app watches the contracts mailbox over IMAP.
   Every contract subject carries a short reference (`[OEP-7KX4Q2]`); a reply
   keeps it, so the scan is matched back to the right contract and filed the same
   way. If the reference has been stripped, the sender's address is used —
   provided exactly one of their contracts is still unsigned.

**Only a real PDF is accepted.** The `%PDF-` magic bytes are checked, so a photo
is refused even when renamed `contract.pdf`. Whoever sent it gets a bilingual
reply saying a scanned PDF is required, with a link to sign on their phone
instead. The contract email states the rule up front.

Either route emails the crew member their signed copy, notifies the admins, burns
the signing token and flips the dashboard status.

### New in the codebase

| File | What it does |
|------|--------------|
| `src/lib/sign-tokens.ts` | one-time signing tokens + the short email reference |
| `src/lib/sign-pdf.ts` | draws a signature into the PDF; PDF sniffing |
| `src/lib/record-signature.ts` | the single path a signed contract takes to Drive + DB |
| `src/lib/inbox.ts` | IMAP watch: matches replies, accepts PDFs, refuses photos |
| `src/lib/email.ts` | rewritten — contract (PDF attached), confirmation, rejection, admin notice |
| `src/app/sign/[token]/` | the crew-facing signing screen |
| `src/app/api/sign/[token]/` | signature submit + PDF preview |
| `src/app/api/inbox/poll/` | mailbox check (admin button, or cron with a key) |
| `src/instrumentation*.ts` | starts the background mailbox watch on boot |

---

## 🔑 Environment — what to check on Hostinger

Everything that was there before still applies. **Remove** the five `DOCUSEAL_*`
variables; nothing reads them any more.

| Group | Status |
|-------|--------|
| Firebase web config (`NEXT_PUBLIC_FIREBASE_*`) | ✅ set (hardcoded fallbacks in code too) |
| Firebase admin (`FIREBASE_ADMIN_*`) | ✅ set (inline) |
| `ADMIN_EMAILS` | ✅ set (code has a fallback union too) |
| Google Drive (client id/secret/refresh token/root folder) | ✅ set |
| SMTP out | ✅ `smtp.hostinger.com:465`, `bayanati@ox.productionsuae.com` |
| **IMAP in** | ⚠️ **nothing to add if the send mailbox also receives** — the app derives `imap.hostinger.com:993` from `SMTP_HOST` and reuses `SMTP_USER`/`SMTP_PASS`. Override with `IMAP_*` only if they differ. |
| `NEXT_PUBLIC_APP_URL` | ⚠️ **must be the live origin** — every signing link in every email is built from it |
| `INBOX_POLL_SECRET` | optional but recommended: lets cron call `/api/inbox/poll?key=…` |
| `INBOX_POLL_INTERVAL_MINUTES` | optional, default 5. Set `0` to disable the in-app timer |

---

## ⛔ What's left

1. **Deploy this commit** — Hostinger → Deployments → Deploy. (If the page looks
   stale afterwards: Cache Manager → Purge All.)
2. **Confirm the mailbox watch started.** The app log should print
   `[inbox] watching the contracts mailbox every 5 min` shortly after boot. If it
   instead says polling is off, the IMAP credentials did not resolve. If Hostinger
   blocks outbound port 993 from the Node app, set
   `INBOX_POLL_INTERVAL_MINUTES=0` and add an hPanel cron job hitting
   `https://bayanati.productionsuae.com/api/inbox/poll?key=$INBOX_POLL_SECRET`
   every 5 minutes — the phone-signing route is unaffected either way.
3. **Full pipeline test** — see the smoke test at the end of DEPLOYMENT.md:
   email A+B → sign one on a phone → print/scan/reply the other → reply to one
   with a photo and check the refusal comes back.
4. **Remove the `DOCUSEAL_*` variables** from the Hostinger env panel.

---

## 🔧 How the system works (quick map)

1. Crew submits `/crew/form` → `POST /api/crew/submit` uploads the 3 ID images to
   Drive and writes `/crew/{crewId}` (status `submitted`) in the `_intake` pool.
2. Admin sets role/amounts/dates/IBAN → **Email A+B for signature**.
3. Server generates the bilingual PDF per contract → Drive
   `.../Contracts/Pending/{CREW}/` → emails it, attached, with a signing link and
   a reference in the subject.
4. Crew signs on their phone **or** replies with a scanned PDF.
5. Either way `recordSignedContract()` files it under `.../Contracts/Signed/{CREW}/`,
   updates the status, emails a copy and notifies the admins.
6. Optional: **Apply company stamp** re-fetches the signed PDF from Drive, adds
   the seal and saves a `- stamped.pdf` alongside it.

**Key files:** `src/lib/inbox.ts` · `src/lib/sign-pdf.ts` ·
`src/lib/record-signature.ts` · `src/lib/email.ts` · `src/lib/sign-tokens.ts` ·
`src/app/sign/[token]/page.tsx` · `src/lib/drive.ts`.

---

## ⚠️ Known constraints

- **Node 18 on Hostinger.** Avoid Node 20+ globals in server code (`File` is not
  defined there — this already 500'd a release once; `instanceof Blob` is the
  workaround). `imapflow` and `mailparser` are pinned to Node-18-compatible
  majors for the same reason; don't bump them to `imapflow@2`/`mailparser@3.9`
  without moving the host to Node 20+.
- **One instance.** The in-app mailbox timer assumes a single Node process. If the
  app is ever scaled out, set `INBOX_POLL_INTERVAL_MINUTES=0` and drive the poll
  from cron instead, or two instances will race on the same replies. (They would
  not double-file — `/inboxProcessed` de-dupes — but they would do the work twice.)
- **Reference in the subject.** A crew member who replies from a client that
  rewrites the subject, or who starts a brand-new email, falls back to
  address-matching, and that only resolves when one contract is outstanding.
  Anything ambiguous is left in the mailbox and the admins are emailed.
- **The mailbox tidies itself.** Handled replies are flagged read (and moved, if
  `IMAP_PROCESSED_MAILBOX` is set). Use a mailbox the team is happy to share with
  an automation.

---

## 🧪 Synthetic upload test (for a fresh chat)

The live upload endpoint is `POST https://bayanati.productionsuae.com/api/crew/submit`.
It expects multipart/form-data with fields `firstName, lastName, email, phone,
nationality, dob, emiratesId, passport, iban, language` and three image parts
`emiratesIdFront, emiratesIdBack, passportImage` (JPG/PNG < 5MB each). Validation
(see `src/lib/validation.ts`): phone `+971` format, Emirates ID 15 digits starting
784 + Luhn, IBAN valid MOD-97. A success returns `{"ok":true,"crewId":"…"}` and a
folder appears in the "Crew Docs" Drive. Delete test records from the dashboard.

# Bayanati — Crew Management & Contract Automation

Crew intake + contract automation for **Over Exposure Productions**.
Forms → Firebase → auto-generated PDF contracts → emailed for signature →
signed copies filed in Google Drive.

- **Frontend/API:** Next.js 14 (App Router, TypeScript, Tailwind)
- **Backend:** Firebase (Realtime Database + Auth) via the Admin SDK
- **Signatures:** in-house. Each contract is emailed with the PDF attached and a
  one-time link to sign on a phone; a crew member who prefers paper prints it,
  signs, scans and replies, and the app files the scan itself.
- **Storage of record:** Google Drive
- **Email:** SMTP out (Nodemailer) + IMAP in (ImapFlow) — the same mailbox

Everything runs on free tiers. Mobile-first, bilingual (Arabic / English, RTL-aware).

---

## What's built

| Area | Route / file | Status |
|------|--------------|--------|
| Landing | `/` | ✅ |
| Crew intake form (4 steps, AR/EN, validation, uploads) | `/crew/form` | ✅ |
| Admin login (Google + email/password) | `/auth/login` | ✅ |
| Admin dashboard (live stats, filters, cards/table) | `/crew/dashboard` | ✅ |
| Crew details + actions (role, amounts, dates, send) | dashboard modal | ✅ |
| Admin field updates | `POST /api/crew/update` | ✅ |
| Import a crew sheet into contract R | `POST /api/crew/import-sheet` | ✅ |
| Generate + email contracts (PDF attached) | `POST /api/contracts/generate` | ✅ |
| Crew signing page (phone signature) | `/sign/{token}` | ✅ |
| Signature submit / contract preview | `POST /api/sign/{token}`, `GET /api/sign/{token}/pdf` | ✅ |
| Watch the mailbox for signed scans | `POST /api/inbox/poll` | ✅ |
| Company stamp on signed copies | `POST /api/contracts/stamp` | ✅ |
| Session / admin-claim grant | `POST /api/auth/session` | ✅ |
| Security rules (Realtime DB) | `database.rules.json` | ✅ |

### Validation
- Email, UAE phone (`+971…`), passport (6–10 alphanumerics)
- Emirates ID (15 digits, `784…`, Luhn checksum)
- IBAN (ISO 13616 MOD-97; UAE length check)
- Image uploads: JPG/PNG only, < 5 MB

### Importing a crew sheet

**Import sheet** on the dashboard reads a production's own crew sheet (`.xlsx`,
`.csv` or `.tsv`) and fills contract R from it — the amount, and optionally the
role and the shoot dates — for each person it can match to a crew record.

The sheet needs a header row with a **NAME** column and an **AMOUNT** column;
**ROLE**, **START DATE**, **END DATE** and a day count are used when present, and
the header row may sit under a title or a blank line. `.xlsx` files are read
directly (`src/lib/xlsx.ts`), with no spreadsheet dependency.

Two things a crew sheet always needs a human for, so the import asks rather than
guesses:

- **Which person is this?** Names are ranked against the crew list (spelling
  variants, run-together names, Arabic transliteration), and the best match is
  pre-selected — but every row's person is a dropdown, and a row nobody confirms
  is not written.
- **Which date is this?** Excel silently reads `03/09/2026` as 3 September or 9
  March depending on the machine that typed it, and one column routinely holds
  both. Where the sheet's day count settles it, the matching reading is used;
  where it does not, the row is flagged with both readings and the amounts still
  import.

Nothing is saved by the upload itself: `POST /api/crew/import-sheet` only parses
and reports. The confirmed rows are then written through the ordinary
`POST /api/crew/update`, and contract R can be generated in the same step.

---

## Data model (Realtime Database)

The spec's nested `/projects/{id}/crew/{id}` is flattened to a top-level
`/crew` collection with a `projectId` field — cleaner for the "all crew"
dashboard queries. New intake lands in the `_intake` pool until an admin
reassigns a project.

```
/crew/{crewId}
  id, projectId, createdAt, updatedAt
  personal   { firstName, lastName, email, phone, nationality, dob }
  documents  { emiratesId, passport, emiratesIdFront|Back, passportImage (Drive links), driveFolder }
  contract   { status, language, role, amountX, amountY, dateFrom, dateTo, iban,
               overrides, sentAt, pdfLinkX|Y, pdfFileIdX|Y,
               signUrlX|Y, signTokenX|Y, signRefX|Y, stampLinkX|Y }
  signatures { contractX {signed,timestamp,driveLink,driveFileId,method,signerName},
               contractY {…} }
/projects/{projectId}   { id, name, createdAt }
/signTokens/{token}     { crewId, type, ref, expiresAt, used }  ← the signing link
/signRefs/{OEP-XXXXXX}  { crewId, type, token }                 ← matches replies
/inboxProcessed/{hash}  { at, from, subject, outcome }           ← reply de-dupe
/audit/{autoId}         { action, actor, crewId, projectId, detail, timestamp }
```

`crewId = sanitised(email) + "_" + timestamp`.

Status flow: `submitted → (admin sets role/amounts/dates) → sent → signed_x/signed_y → both_signed`.

## How a contract gets signed

1. An admin fills in role, amounts, dates and IBAN, then hits **Email for
   signature**. Each contract goes out as its own email: the bilingual PDF
   attached, a one-time signing link, and a short reference like `OEP-7KX4Q2` in
   the subject.
2. **On a phone** — the link opens `/sign/{token}`, where the crew member reads
   the PDF, draws a signature with their finger, types their name and confirms.
   The drawing is stamped into the signature box of the very PDF that was
   emailed, along with an attestation line (name, time, IP, reference), and the
   signed copy is filed in Drive.
3. **On paper** — they print, sign, scan and reply. `src/lib/inbox.ts` reads the
   mailbox (every 5 minutes by default, or on demand from the dashboard's
   **Check inbox** button), matches the reply by its reference, and files the
   scan the same way.
4. Either route marks the contract signed, emails the crew member a copy and
   notifies the admins. The signing token is single-use and burnt on the way.

**Only a real PDF is accepted as a signed contract.** The magic bytes are
checked, not the filename, so a photo — even one renamed `contract.pdf` — is
refused, and the sender gets a bilingual reply explaining they need to send a
scan. This is stated up front in the contract email itself.

---

## Quick start (local)

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                        # http://localhost:3000
```

Typecheck / build:

```bash
npm run typecheck
npm run build
```

You need real Firebase, Google Drive and mailbox credentials for the full flow.
See **DEPLOYMENT.md** for the step-by-step service setup — in particular the
IMAP side, which is what lets an emailed scan file itself.

---

## Contract templates

`src/lib/contract-templates.ts` holds the bilingual contract text with
`{PLACEHOLDER}` markers. The default wording is a professional UAE freelance
work-execution agreement — **replace the clause text with the exact wording from
the real OEP Arabic contract (مساعد_درون.pdf) before production**, keeping the
placeholder names intact:

`{CREW_NAME} {ROLE} {AMOUNT} {AMOUNT_X} {AMOUNT_Y} {DATE_FROM} {DATE_TO} {IBAN} {PROJECT_NAME} {EMIRATES_ID} {PASSPORT} {NATIONALITY} {TODAY}`

Two PDFs are generated per crew member: **Contract A** (amount A) and
**Contract R** (amount R). `{AMOUNT}` resolves to whichever variant is rendering.

**Arabic PDFs** use the embedded Amiri face in `src/assets/fonts/`
(see `src/assets/fonts/README.md`).

The dashed **signature box** printed on page 1 is `SIGNATURE_BOX` in
`src/lib/contract-pdf.ts`. `src/lib/sign-pdf.ts` writes into exactly that box, so
an online signature and a pen signature land in the same place — move one and the
other follows.

---

## Security notes

- Admin access = email in `ADMIN_EMAILS`. On first login a whitelisted user is
  granted the `admin` custom claim (`/api/auth/session`), which the DB rules
  check. Optionally pre-grant with `node --env-file=.env.local scripts/set-admin.mjs`.
- Realtime DB: crew can only *create* their own node (status `submitted`); reads
  and all edits require the admin claim. Server writes use the Admin SDK and
  bypass rules.
- Signing links: a `/sign/{token}` URL carries a 32-byte random token and is the
  only authorisation that page needs — there is no login, because crew members
  have no account. Tokens are single-use, expire after 120 days, are burnt as
  soon as a contract is signed by any route, and are re-issued (invalidating the
  old one) whenever a contract is re-sent. `/signTokens` and `/signRefs` are
  server-only in the DB rules.
- IBAN is masked in the UI (last 4 shown). ID images live in Drive, not in the DB.
- `.env.local` and service-account JSON are git-ignored — never commit secrets.
```

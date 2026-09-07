# Bayanati — Crew Management & Contract Automation

Crew intake + contract automation for **Over Exposure Productions**.
Forms → Firebase → auto-generated PDF contracts → Docuseal e-signatures → Google Drive.

- **Frontend/API:** Next.js 14 (App Router, TypeScript, Tailwind)
- **Backend:** Firebase (Realtime Database, Auth, Storage) via the Admin SDK
- **E-signatures:** self-hosted Docuseal
- **Storage of record:** Google Drive
- **Email:** SMTP (Nodemailer)

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
| Post-submit Drive sync | `POST /api/crew/after-submit` | ✅ |
| Admin field updates | `POST /api/crew/update` | ✅ |
| Contract generation + Docuseal + email | `POST /api/contracts/generate` | ✅ |
| Docuseal signed-webhook handler | `POST /api/webhook/docuseal` | ✅ |
| Session / admin-claim grant | `POST /api/auth/session` | ✅ |
| Security rules (DB + Storage) | `database.rules.json`, `storage.rules` | ✅ |

### Validation
- Email, UAE phone (`+971…`), passport (6–10 alphanumerics)
- Emirates ID (15 digits, `784…`, Luhn checksum)
- IBAN (ISO 13616 MOD-97; UAE length check)
- Image uploads: JPG/PNG only, < 5 MB

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
  documents  { emiratesId, passport, emiratesIdFront|Back, passportImage (Storage paths), driveFolder }
  contract   { status, language, role, amountX, amountY, dateFrom, dateTo, iban,
               sentAt, docusealSubmissionX|Y, signUrlX|Y }
  signatures { contractX {signed,timestamp,driveLink}, contractY {…} }
/projects/{projectId}   { id, name, createdAt }
/contracts/{contractId} (optional flat index; primary state lives on /crew)
/docusealIndex/{submissionId} { crewId, type }   ← webhook lookup
/audit/{autoId}         { action, actor, crewId, projectId, detail, timestamp }
```

`crewId = sanitised(email) + "_" + timestamp`.

Status flow: `submitted → (admin sets role/amounts/dates) → sent → signed_x/signed_y → both_signed`.

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

You need real Firebase + Google + Docuseal + SMTP credentials for the full flow.
See **DEPLOYMENT.md** for the step-by-step service setup, and **DOCUSEAL_SETUP.md**
for the e-signature side.

---

## Contract templates

`src/lib/contract-templates.ts` holds the bilingual contract text with
`{PLACEHOLDER}` markers. The default wording is a professional UAE freelance
work-execution agreement — **replace the clause text with the exact wording from
the real OEP Arabic contract (مساعد_درون.pdf) before production**, keeping the
placeholder names intact:

`{CREW_NAME} {ROLE} {AMOUNT} {AMOUNT_X} {AMOUNT_Y} {DATE_FROM} {DATE_TO} {IBAN} {PROJECT_NAME} {EMIRATES_ID} {PASSPORT} {NATIONALITY} {TODAY}`

Two PDFs are generated per crew member: **Contract X** (amount X) and
**Contract Y** (amount Y). `{AMOUNT}` resolves to whichever variant is rendering.

**Arabic PDFs** need `src/assets/fonts/NotoNaskhArabic-Regular.ttf`
(see `src/assets/fonts/README.md`). For legal-grade Arabic fidelity, prefer a
Docuseal template built from the original Arabic PDF.

---

## Security notes

- Admin access = email in `ADMIN_EMAILS`. On first login a whitelisted user is
  granted the `admin` custom claim (`/api/auth/session`), which the DB/Storage
  rules check. Optionally pre-grant with `node --env-file=.env.local scripts/set-admin.mjs`.
- Realtime DB: crew can only *create* their own node (status `submitted`); reads
  and all edits require the admin claim. Server writes use the Admin SDK and
  bypass rules.
- Storage: anyone may upload a valid image at intake; only admins can read them.
  The server reads uploads via the Admin SDK (no public read).
- IBAN is masked in the UI (last 4 shown). ID images live in Storage/Drive, not
  in the DB.
- `.env.local` and service-account JSON are git-ignored — never commit secrets.
```

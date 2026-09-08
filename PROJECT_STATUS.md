# Bayanati — Status & Plan

_Last updated: 2026-09-08_

Crew intake + contract automation for **Over Exposure Productions**.
Next.js 14 (App Router, TS, Tailwind) + Firebase (Realtime DB + Auth) +
self-hosted Docuseal + Google Drive. Bilingual AR/EN with RTL.

**Repo:** https://github.com/unknown5666/bayanati (`main`)
**Live app:** https://bayanati.productionsuae.com — **Hostinger web-app hosting** (deploys from the GitHub repo; Node 18.20.8)
**Docuseal:** https://oep-docuseal.onrender.com (Render, free tier)
**Latest commit:** `2022c52`

---

## 🟢 Live status

App is deployed and running. Homepage, crew intake form, login, and admin
dashboard all load, with the **Over Exposure brand mark on every page**.
Crew uploads now go **straight to Google Drive** (Firebase Storage removed).
All credentials are in the Hostinger env panel. **Last step: deploy commit
`2022c52` and run the end-to-end test.**

---

## ✅ What's done this session

### Architecture change — uploads go direct to Drive (no Firebase Storage)
- Old flow was browser → Firebase Storage → server → Drive. The `oep-crew-system`
  project never had a Storage bucket provisioned (unauth upload returned HTTP 404),
  so every crew upload failed. Firebase Storage removed entirely.
- New flow: browser → **`POST /api/crew/submit`** (multipart: fields + 3 ID images)
  → server validates server-side → uploads directly via the Drive OAuth client →
  writes the crew record with the Admin SDK. One hop.
- Removed: `api/crew/after-submit`, `storage.rules`, `firebaseStorage()`,
  `adminBucket()`, storage block in `firebase.json`. `/crew` RTDB write tightened
  to admin-only (intake no longer needs an unauthenticated write path).
- `documents.emiratesIdFront/Back/passportImage` now hold Drive webViewLinks.

### Branding on every page
- New `src/components/BrandMark.tsx` (OEP logo redrawn as inline SVG — black
  squircle, white field, two-tone maroon `#8e1f3f` "X") + `BrandHeader.tsx`,
  wired into the root layout so every page shows it once. Removed duplicate
  "Over Exposure" eyebrows from home/login/dashboard. Maroon added to Tailwind
  as `brand`. (SVG is a faithful recreation; to use the exact PNG, drop it at
  `public/oep-logo.png` and swap the `<svg>` in BrandMark for an `<img>`.)

### Node 18 fix
- Hostinger runs **Node 18**, where `File` is not a global. `f instanceof File`
  in the upload route threw "File is not defined" and 500'd every live
  submission (passed local build on Node 22). Fixed in `2022c52` → use
  `instanceof Blob`. **Avoid Node 20+ globals in server code for this project.**

---

## 🔑 Credentials — all set in Hostinger (25 env vars)

| Group | Status |
|-------|--------|
| Firebase web config (`NEXT_PUBLIC_FIREBASE_*`) | ✅ set (also hardcoded fallbacks in code) |
| Firebase admin (`FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`) | ✅ set (inline) |
| `ADMIN_EMAILS` | ✅ set (code has a fallback union too) |
| Google Drive | ✅ **new Desktop OAuth client** `634616860348-3afqke62ot8sijb0tabts5l8n7aepc8s`; refresh token minted + verified (authed as marketingoxproductions@gmail.com, folder "Crew Docs", canAddChildren:true) |
| Docuseal | ✅ `DOCUSEAL_BASE_URL=https://oep-docuseal.onrender.com`, API key verified (GET /api/templates → 200), `DOCUSEAL_WEBHOOK_SECRET` set |
| Email (SMTP) | ✅ sends from **own domain**: `smtp.hostinger.com:465`, `SMTP_SECURE=true`, `SMTP_USER=bayanati@ox.productionsuae.com`, `EMAIL_FROM="Over Exposure Productions <bayanati@ox.productionsuae.com>"`. `SMTP_PASS` = that mailbox's password (user set) |

> The old Google Drive OAuth client was a "Web application" type → loopback
> `npm run drive:auth` failed with `redirect_uri_mismatch`. Fixed by creating a
> **Desktop app** OAuth client (loopback allowed). All 3 Drive env vars updated
> to the new client.

---

## ⛔ What's left (in order)

1. **Deploy commit `2022c52`** — Hostinger → Deployments → Deploy. (If the page
   looks stale after: Cache Manager → Purge All.)
2. **Run the synthetic upload test** (see prompt below / next section) — confirms
   browser → server → Drive works on production.
3. **Docuseal webhook** — in the Docuseal console (Settings → Webhooks), confirm:
   - URL: `https://bayanati.productionsuae.com/api/webhook/docuseal`
   - Event: `form.completed` (+ `submission.completed` if listed)
   - Custom header `X-Webhook-Secret` = the `DOCUSEAL_WEBHOOK_SECRET` env value
4. **Full pipeline test** — dashboard → open a crew member → set Role/Amounts/
   Dates → **Generate & Send Contracts** → check email from `bayanati@…` → sign
   both links → status flips to **Both Signed**, signed PDFs land in Drive
   `.../Contracts/Signed/{Crew}/`.

---

## 🔧 How the system works (quick map)

1. Crew submits `/crew/form` → `POST /api/crew/submit` uploads the 3 ID images to
   Drive and writes `/crew/{crewId}` (status `submitted`) in the `_intake` pool.
2. Admin sets role/amounts/dates → **Generate & Send Contracts**.
3. Server generates `contract_X.pdf` + `contract_Y.pdf` → Drive `.../Contracts/Pending/{CREW}/`.
4. Each PDF → Docuseal template + submission (Docuseal email off; Bayanati sends
   one branded email with both signing links).
5. Crew signs → Docuseal webhook → signed PDF pulled to Drive `.../Signed/`,
   status → `both_signed`.

**Key files:** `src/app/api/crew/submit/route.ts` · `src/lib/drive.ts` ·
`src/lib/docuseal.ts` · `src/app/api/webhook/docuseal/route.ts` ·
`src/lib/email.ts` · `src/components/BrandHeader.tsx` · `render.yaml`.

---

## 🧪 Synthetic upload test (for a fresh chat)

The live upload endpoint is `POST https://bayanati.productionsuae.com/api/crew/submit`.
It expects multipart/form-data with fields `firstName, lastName, email, phone,
nationality, dob, emiratesId, passport, iban, language` and three image parts
`emiratesIdFront, emiratesIdBack, passportImage` (JPG/PNG < 5MB each). Validation
(see `src/lib/validation.ts`): phone `+971` format, Emirates ID 15 digits starting
784 + Luhn, IBAN valid MOD-97. A success returns `{"ok":true,"crewId":"…"}` and a
folder appears in the "Crew Docs" Drive. Delete test records from the dashboard.

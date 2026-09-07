# Deployment & Service Setup

Do these in order. Everything is free-tier.

---

## 1. Firebase (5–10 min)

1. https://console.firebase.google.com → **Add project** → name it `OEP-Crew-System`.
2. **Build → Realtime Database** → Create database → *Start in test mode* (we'll
   replace the rules in step 3).
3. **Build → Authentication → Get started** → enable **Email/Password** and
   **Google**.
4. **Build → Storage → Get started** (default rules for now).
5. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an
   app. Copy the config into `.env.local` (`NEXT_PUBLIC_FIREBASE_*`).
6. **Project settings → Service accounts → Generate new private key**. From the
   downloaded JSON copy:
   - `project_id`   → `FIREBASE_ADMIN_PROJECT_ID`
   - `client_email` → `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `private_key`  → `FIREBASE_ADMIN_PRIVATE_KEY` (keep the `\n` sequences; wrap
     the whole thing in double quotes in `.env.local`).

### Deploy the security rules

Install the CLI once: `npm i -g firebase-tools`, then `firebase login`.

```bash
firebase use --add            # pick the OEP-Crew-System project, alias "default"
firebase deploy --only database,storage
```

This pushes `database.rules.json` and `storage.rules` (referenced by `firebase.json`).

### Grant admin

Put the admin emails in `ADMIN_EMAILS` (comma-separated). Either:
- just have each admin sign in once (the app auto-grants the claim), **or**
- pre-grant: `node --env-file=.env.local scripts/set-admin.mjs`
  (users must exist in Auth first).

---

## 2. Google Drive API (10 min)

1. https://console.cloud.google.com → select the **same** project (Firebase
   projects appear here) → **APIs & Services → Library** → enable **Google Drive API**.
2. **APIs & Services → OAuth consent screen** → External → add your Google
   account as a **Test user** (so the refresh token doesn't expire in 7 days,
   publish the app when ready).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Desktop app.** Copy Client ID/Secret into `.env.local`
   (`GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET`).
4. Create the top-level **"Over Exposure Productions"** folder in the Drive of
   the account that will own the files. Open it and copy the ID from the URL
   (`https://drive.google.com/drive/folders/<THIS_ID>`) → `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
5. Mint the refresh token:
   ```bash
   node --env-file=.env.local scripts/get-drive-token.mjs
   ```
   Follow the URL, approve with the OEP account, paste the code back, then copy
   the printed `GOOGLE_DRIVE_REFRESH_TOKEN` into `.env.local`.

The app creates the `Projects/{PROJECT}/Crew|Contracts/...` subfolders on demand.

---

## 3. Docuseal (self-hosted)

See **DOCUSEAL_SETUP.md**. You'll end up with `DOCUSEAL_BASE_URL`,
`DOCUSEAL_API_KEY`, and a `DOCUSEAL_WEBHOOK_SECRET` in `.env.local`.

---

## 4. Email (SMTP)

Any SMTP account works. For a Hostinger mailbox:
`SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`,
`SMTP_USER`/`SMTP_PASS` = the mailbox, `EMAIL_FROM="Over Exposure Productions <crew@yourdomain>"`.

---

## 5. Arabic contract font (only if you send Arabic PDFs)

Drop `NotoNaskhArabic-Regular.ttf` into `src/assets/fonts/`
(see `src/assets/fonts/README.md`).

---

## 6. Host the app

The app needs **all** env vars at build time (the `NEXT_PUBLIC_*` ones are inlined
into the client bundle). Set them in your host's environment settings.

### Option A — Vercel (simplest for Next.js)
1. Push to GitHub (below), import the repo at https://vercel.com/new.
2. Add every variable from `.env.local` in **Project → Settings → Environment
   Variables**.
3. Set `NEXT_PUBLIC_APP_URL` to the Vercel URL. Deploy.

### Option B — Hostinger (Node.js hosting)
1. Push to GitHub (below).
2. In hPanel → **Websites → your site → Node.js** (or VPS), connect the GitHub repo.
3. Build command: `npm run build` · Start command: `npm start` · Node ≥ 18.
4. Add all env vars in the Node.js app's environment settings.
5. Point your domain at the app. `NEXT_PUBLIC_APP_URL=https://yourdomain.com`.

### After first deploy
- Add your deployed origin to **Firebase Auth → Settings → Authorized domains**.
- Set the Docuseal webhook URL to `https://<your-app>/api/webhook/docuseal`
  (DOCUSEAL_SETUP.md).

---

## 7. Push to GitHub

```bash
git init
git add .
git commit -m "Initial Bayanati build"
git branch -M main
git remote add origin https://github.com/unknown5666/bayanati.git
git push -u origin main
```

> If the remote already has commits, pull/merge first:
> `git pull origin main --allow-unrelated-histories` then resolve and push.

---

## Smoke test the full flow

1. `/crew/form` → submit a test crew member (use a mailbox you control).
2. Dashboard → open the crew → set **Role**, **Amounts**, **Dates** → **Generate
   & Send Contracts**.
3. Check the email (two signing buttons), sign both in Docuseal.
4. Watch the dashboard flip to **Both Signed** and the signed PDFs appear under
   `Projects/{PROJECT}/Contracts/Signed/{CREW}` in Drive.

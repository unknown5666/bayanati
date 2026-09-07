# Docuseal Setup (self-hosted, free)

Docuseal handles the actual e-signing. Bayanati creates a template from each
generated PDF, creates a signing request per crew member, and listens for a
webhook when they finish.

---

## 1. Deploy Docuseal on Render (free)

This repo ships a ready Blueprint at its root: **`render.yaml`**. It deploys the
**official Docuseal Docker image directly** — there is nothing to fork or build.

1. Go to [render.com](https://render.com) and **sign in with GitHub**.
2. **New → Blueprint** → pick the **`unknown5666/bayanati`** repo. Render reads
   `render.yaml` and provisions the Docuseal web service **and** a Postgres
   database automatically (`SECRET_KEY_BASE` is generated for you).
3. Click **Apply** and wait for the deploy to go green.
4. Open the service URL (something like `https://oep-docuseal.onrender.com`) →
   this is your **`DOCUSEAL_BASE_URL`**.

> The blueprint only defines Docuseal. The Bayanati app itself is deployed
> separately on Hostinger, so the two never collide. If Render rejects the
> `free` plan for your account, change both `plan:` values in `render.yaml` to
> `starter` and re-apply.

> Free-tier caveats (fine for launch): free web services sleep when idle (first
> request after sleep is slow) and have no persistent disk, so Docuseal's local
> files are ephemeral — but Bayanati pulls each **signed** PDF into Google Drive
> right away via the webhook, so completed contracts are safe. Render's free
> Postgres is deleted after ~30 days; upgrade the DB before real production use.

---

## 2. Create the accounts

On first load Docuseal asks you to create the initial admin. Use the OEP
credentials you standardised on:

- **Super Admin** — username `Saad`, password `6969`
- **Regular User** — username `Abdullah`, password `11102`
  (add from **Settings → Users** after the first admin exists)

> These are your internal operator logins for the Docuseal console — separate
> from Bayanati's own admin login. Change them to strong passwords before going
> live; the values above are just the initial placeholders.

---

## 3. Get the API key

Docuseal console → **Settings → API** → copy the API token → `DOCUSEAL_API_KEY`.

The client calls `POST /api/templates/pdf` and `POST /api/submissions` with the
`X-Auth-Token` header (see `src/lib/docuseal.ts`).

---

## 4. Configure the webhook

Docuseal console → **Settings → Webhooks → Add**:

- **URL:** `https://<your-app>/api/webhook/docuseal`
- **Events:** `form.completed` (and `submission.completed` if listed)
- **Custom header:** add `X-Webhook-Secret` = the same random string you put in
  `DOCUSEAL_WEBHOOK_SECRET`.

The handler verifies this header, downloads the signed PDF, files it under
`Projects/{PROJECT}/Contracts/Signed/{CREW}/contract_{X|Y}_signed.pdf` in Drive,
and marks the signature in the DB. The dashboard updates in real time.

---

## How the flow works

1. Admin clicks **Generate & Send Contracts**.
2. Server generates `contract_X.pdf` and `contract_Y.pdf`, stores them under
   Drive `.../Contracts/Pending/{CREW}/`.
3. For each PDF: create a Docuseal template (with a signature + date field near
   the bottom) and a submission for the crew member. Docuseal's own email is
   disabled — Bayanati sends one branded email with **both** signing links.
4. Crew opens each link, signs. Docuseal fires the webhook per completed form.
5. Webhook stores the signed PDF in Drive/Signed and flips status
   → `signed_x` / `signed_y` → `both_signed`.

### Adjusting signature placement
Field positions are page-relative ratios in `src/lib/docuseal.ts`
(`createTemplateFromPdf`, the `areas` array). Tune `x/y/w/h` (0–1, page 0) if your
contract layout puts the signature elsewhere.

### Arabic contracts
For exact Arabic fidelity, instead of generating the Arabic PDF you can build a
Docuseal template directly from the original Arabic PDF (upload it once in the
Docuseal console, place the fields), and point the flow at that template id.

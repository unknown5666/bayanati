# Docuseal Setup (self-hosted, free)

Docuseal handles the actual e-signing. You build a reusable contract **template**
once in the Docuseal console; Bayanati then creates a signing request per crew
member against that template (pre-filling their terms), and listens for a webhook
when they finish.

> **Why a prebuilt template?** Creating a template from a PDF via the API
> (`POST /templates/pdf`) is a Docuseal **Pro** feature — the free/community
> edition returns `404 … available in Pro Edition`. So instead of turning each
> generated PDF into a template, Bayanati signs one prebuilt template and fills
> the per-crew values through the free submissions API. The app still generates
> and archives the full bilingual PDF to Google Drive as the reference copy.

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

The client calls `POST /api/submissions` (free) with the `X-Auth-Token` header
(see `src/lib/docuseal.ts`).

---

## 3b. Build the contract template (once)

Create a fillable template in the Docuseal console — this replaces the Pro-only
"template from PDF" API call:

1. **Templates → New** → upload a contract document (e.g. the app's generated
   bilingual PDF, or your own contract file) and open the field editor.
2. Add a **Signature** field and a **Date** field assigned to the signer role
   **`Crew`** (bottom of the page). These are what the crew fills in.
3. (Optional but recommended) Add **text fields** for the per-crew terms and mark
   them **read-only**. Name them **exactly** as below — Bayanati pre-fills these
   by name and ignores any it can't find:

   | Field name    | Value filled in            |
   |---------------|----------------------------|
   | `crew_name`   | Crew member full name      |
   | `role`        | Role                       |
   | `project`     | Project name               |
   | `contract`    | `A` (contract X) / `B` (Y) |
   | `amount`      | Fee in AED                 |
   | `date_from`   | Engagement start           |
   | `date_to`     | Engagement end             |
   | `iban`        | Payout IBAN                |
   | `emirates_id` | Emirates ID                |
   | `passport`    | Passport number            |
   | `nationality` | Nationality                |
   | `issued_on`   | Contract issue date        |

4. Save. The template's **id** is in its URL / details — put it in the app env as
   `DOCUSEAL_TEMPLATE_ID` (used for both contracts). If contracts A and B need
   different templates, set `DOCUSEAL_TEMPLATE_ID_X` and `DOCUSEAL_TEMPLATE_ID_Y`
   instead.

> Arabic values placed in Docuseal text fields may not shape/join correctly
> (Docuseal renders fields left-to-right). Keep pre-filled fields to Latin/number
> values (names, amount, IBAN, dates), or bake Arabic terms into the template's
> static document rather than into fields. The fully-shaped bilingual contract is
> always available as the app-generated PDF in Drive.

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
3. For each contract: create a Docuseal **submission** against the prebuilt
   template (`DOCUSEAL_TEMPLATE_ID[_X|_Y]`), pre-filling that crew's terms as
   read-only fields. Docuseal's own email is disabled — Bayanati sends one
   branded email with **both** signing links.
4. Crew opens each link, signs. Docuseal fires the webhook per completed form.
5. Webhook stores the signed PDF in Drive/Signed and flips status
   → `signed_x` / `signed_y` → `both_signed`.

### Adjusting signature / field placement
Field positions live in the **template** you built in the Docuseal console, not
in code — move the Signature/Date or any pre-filled field there. The app only
supplies values by field name (`src/lib/docuseal.ts` → `createSubmission`).

### Arabic contracts
The fully-shaped bilingual contract is the app-generated PDF (archived to Drive
and linked in the email). Because Docuseal renders template fields left-to-right,
keep pre-filled fields to Latin/number values; put any Arabic wording into the
template's static document rather than into fields.

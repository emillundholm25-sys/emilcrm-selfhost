# EmilCRM Quickstart

Your fastest path from purchase to a live CRM. About 10 minutes, no terminal needed.
This is the checklist; the interactive helper (with one-click secret generation) is at
**[emilcrm.com/quickstart](https://emilcrm.com/quickstart.html)**, and the video walkthrough
follows these exact steps.

You'll deploy EmilCRM to **your own** Vercel + Neon accounts (both free). Your data stays
yours — it never touches our servers.

---

## Before you start (2 min)

- [ ] A **GitHub** account — [github.com/signup](https://github.com/signup) (free)
- [ ] A **Vercel** account — [vercel.com/signup](https://vercel.com/signup), "Continue with GitHub" (free)
- [ ] Your **license key** — it's in your purchase email

## Step 1 — Generate your two secrets (1 min)

EmilCRM needs two random secrets: `AUTH_SECRET` (signs your login) and `INGEST_TOKEN`
(the key for the AI connector). Open **[emilcrm.com/quickstart](https://emilcrm.com/quickstart.html)**
and click **Generate** twice — copy each value somewhere safe for the next step.

> Prefer the terminal? Each secret is `openssl rand -base64 32`.

## Step 2 — Deploy (2 min)

- [ ] Click the **Deploy** button (on the Quickstart page or in the README).
- [ ] Vercel asks you to connect GitHub and pick a project name — anything works (e.g. `emilcrm`).
- [ ] Fill the environment variables it asks for:

  | Field | What to paste |
  | --- | --- |
  | `APP_PASSWORD` | A password you choose (you'll type it to sign in) |
  | `AUTH_SECRET` | The first secret from Step 1 |
  | `INGEST_TOKEN` | The second secret from Step 1 |
  | `REQUIRE_LICENSE` | `1` |
  | `LICENSE_KEY` | Your key from the purchase email |

- [ ] Click **Deploy** and wait for the build (~1 min).

## Step 3 — Add your database (2 min)

- [ ] In the new project → **Storage** tab → **Create Database** → **Neon (Postgres)** → accept the free plan.
- [ ] Vercel connects it and sets `DATABASE_URL` for you automatically.

## Step 4 — Redeploy so it all takes effect (1 min)

- [ ] Go to **Deployments** → the top one → **⋯** menu → **Redeploy**.
- [ ] This is the step people forget — the database and secrets only apply to a *new* build.

## Step 5 — Sign in (1 min)

- [ ] Open your app (Vercel shows the URL, like `your-emilcrm.vercel.app`).
- [ ] If it asks to activate, paste your license key. Sign in with your `APP_PASSWORD`.
- [ ] You're live. 🎉

---

## Optional — turn on AI prospecting (5 min)

This is the part where Claude fills your pipeline. You need your own **Apollo** account and
an AI client (Claude Desktop, Cursor, etc.).

- [ ] In the app: **Settings → Connect your own Claude**. Copy the `emilcrm-mcp` config shown there.
- [ ] Paste it into your AI client's connector settings (it uses your app URL + your `INGEST_TOKEN`).
- [ ] Add an **Apollo** connector in the same client (your own Apollo account).
- [ ] Say *"find prospects for my campaign"* — Claude sources, scores, and files them into your pipeline.

## Optional — AI call scripts & telephony

- [ ] **AI cold-call scripts + call summaries:** add `ANTHROPIC_API_KEY` (from
  [console.anthropic.com](https://console.anthropic.com)) in Vercel → Settings → Environment
  Variables, then redeploy.
- [ ] **Click-to-call (CloudTalk):** see **Settings → Telephony** in the app for the exact keys + webhook URL.

---

## If something looks off

- **Login won't stick / no login screen** → `APP_PASSWORD` *and* `AUTH_SECRET` must both be set. Re-check Step 2, then redeploy.
- **"Database not configured"** → you missed Step 4. Redeploy after adding Neon.
- **License won't activate** → confirm you pasted the key from your email exactly, and `REQUIRE_LICENSE` is `1`.
- **Still stuck?** Quickstart includes priority email support — reply to your purchase email.

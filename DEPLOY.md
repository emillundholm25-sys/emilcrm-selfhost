# Deploy your own EmilCRM

EmilCRM is self-hosted: you run your own copy on Vercel + Neon (both have free tiers
that comfortably cover a single user). You own the data, there's no subscription, and
you bring your own Apollo account for prospecting.

## One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/emillundholm25-sys/emilcrm-selfhost&project-name=emilcrm&repository-name=emilcrm&env=APP_PASSWORD,AUTH_SECRET,INGEST_TOKEN,REQUIRE_LICENSE,LICENSE_KEY&envDescription=Password%20to%20sign%20in%2C%20a%20random%20auth%20secret%2C%20an%20ingest%20token%2C%20and%20your%20license%20key&envLink=https://github.com/emillundholm25-sys/emilcrm-selfhost/blob/main/DEPLOY.md)

## Steps for a buyer

1. **Click Deploy.** Vercel forks the template and asks for environment variables (below).
2. **Add a database.** In the new Vercel project → **Storage** → add **Neon Postgres**.
   Vercel sets `DATABASE_URL` automatically.
3. **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) so the database + env vars take effect.
4. Open the app, **activate your license**, sign in, and you're live.

## Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres connection string. Set automatically when you add Neon in Vercel Storage. |
| `APP_PASSWORD` | Recommended | The password you'll type to sign in. Auth is only enforced when this **and** `AUTH_SECRET` are set. |
| `AUTH_SECRET` | Recommended | Random secret that signs the login cookie. Generate: `openssl rand -base64 32`. |
| `INGEST_TOKEN` | For prospecting | Bearer token for the Cowork prospecting connector (`/api/mcp`, `/api/ingest`). Generate: `openssl rand -base64 32`. |
| `REQUIRE_LICENSE` | Pre-set to `1` | Turns on the license gate. Leave as `1` for a paid copy. |
| `LICENSE_KEY` | Optional | Your license key. You can set it here, or just paste it in the in-app activation screen (it's stored in your database). |

Every variable except `DATABASE_URL` is optional to *boot* — the app degrades gracefully:
no auth secrets → no login gate; no `INGEST_TOKEN` → prospecting endpoints stay off; no
`REQUIRE_LICENSE` → no license gate. Nothing locks you out by accident.

## After deploying

- **Connect Cowork prospecting** — see [`cowork-plugin/README.md`](cowork-plugin/README.md).
- **Connect Apollo** in Cowork (your own account).
- **Settings → Connect your own Claude** shows the MCP endpoint + config for any MCP client.

## Updating

Pull the latest template into your repo and Vercel redeploys. Your data lives in your
Neon database and is untouched by deploys; you can also export a full JSON backup from
**Settings → Data & backup** anytime.

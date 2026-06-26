# Security

EmilCRM is **single-tenant and self-hosted** — you run your own copy, and your
CRM data lives in your own database. The maintainer has no access to it.

## Posture

- **Your data, your infra.** Contacts and pipeline live in your own Neon Postgres on your own Vercel project. No shared multi-tenant database.
- **Auth.** Optional single-password gate; the session cookie is signed with your `AUTH_SECRET`. Enforced when `APP_PASSWORD` + `AUTH_SECRET` are set.
- **Machine access.** The ingest/MCP prospecting endpoints require a separate bearer token (`INGEST_TOKEN`), distinct from the login password.
- **Transport.** HTTPS (Vercel).
- **Licensing.** Only the license key is sent to Lemon Squeezy to validate; no CRM data leaves your instance. The gate fails open on an outage so a paying user isn't locked out.
- **Portability.** Full JSON backup/export anytime from Settings → Data & backup.

## Known limitations

- Single shared password — no SSO/2FA yet. Use a strong password and secure your hosting accounts.
- The license gate is honor-system (enforced in the app, not cryptographically) — deliberate for a self-host product.
- You are responsible for securing your own Vercel/Neon accounts and for compliant outreach (GDPR, anti-spam).
- The built Cowork `.plugin` contains your `INGEST_TOKEN` in plaintext (a documented workaround) — treat it like a credential; don't commit or share it.

## Reporting a vulnerability

Email **emillundholm25@gmail.com**. Please don't open a public issue for security
problems — report privately and we'll respond.

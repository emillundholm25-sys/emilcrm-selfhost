# EmilCRM Prospecting

> **Using a client other than Cowork?** The [`emilcrm-mcp`](../mcp-server/README.md) server
> gives Claude Desktop, Claude Code, Cursor and Windsurf the same EmilCRM tools over a single
> `npx` command. This Cowork plugin remains the packaged path for Cowork specifically.

Define a campaign's Ideal Customer Profile in EmilCRM, then let Claude run the whole outbound prospecting loop: **search and enrich with Apollo → dedupe → score → write prospects (and first-touch next actions) into the CRM.** You review and reach out; Claude does the sourcing.

## What's in the plugin

- **`prospect` skill** — orchestrates the loop. Triggers on things like "find prospects for Skåne Hospitality", "fill my pipeline", "who should I reach out to".
- **EmilCRM connector** (`emilcrm` MCP server, remote HTTP) — reads campaigns/ICP and writes prospects/contacts through the app's own `/api/mcp` endpoint, which calls the same logic as `/api/ingest` directly (no separate backend to run).
- It also relies on an **Apollo connector** that you connect separately (see Setup).

## How it works

1. `emilcrm_get_overview` → read the campaign's ICP + a ready-made search recipe and the existing contacts.
2. Search Apollo with that recipe; enrich the keepers (reveals cost Apollo credits).
3. Write results back: `emilcrm_add_prospects` (default — suggested, scored, reviewed on the Prospects page) or `emilcrm_add_contacts` (straight into the pipeline with a first-touch next action).
4. Duplicates are skipped automatically (by email / LinkedIn / name+company).

## Setup

### 1. Enable the ingest + MCP endpoints on your EmilCRM app

EmilCRM ships a token-authed `POST/GET /api/ingest` and a token-authed `POST /api/mcp` (the remote MCP endpoint this plugin's connector talks to). Set an `INGEST_TOKEN` so both are enabled:

```bash
# generate a token
openssl rand -base64 32
# set it where the app runs (e.g. Vercel) and redeploy
vercel env add INGEST_TOKEN production
```

Both endpoints stay disabled (HTTP 503) until `INGEST_TOKEN` is set, and require `DATABASE_URL` (Neon) to be configured. Redeploy after adding the env var so `/api/mcp` is live.

### 2. Configure the EmilCRM connector

The connector is a remote HTTP MCP server pointed at `https://YOUR-EMILCRM.vercel.app/api/mcp` — Cowork talks to that deployment directly, nothing runs locally. (Plugin upload validation requires the server URL to be a literal `https://` address, so it's hardcoded in `.mcp.json` rather than templated — if you fork this for a different deployment, edit that URL.)

It needs one value: a bearer token equal to the app's `INGEST_TOKEN`, sent as `Authorization: Bearer <token>`.

**This has to be baked into the shipped `.plugin` zip, not left as a `${VAR}` placeholder.** Claude Code/Cowork has a known bug ([anthropics/claude-code#51581](https://github.com/anthropics/claude-code/issues/51581)) where `${VAR}` substitution silently fails for `.mcp.json` `headers` on HTTP-transport servers — the literal placeholder string gets sent to the server instead of the real value, so the request 401s and the connector never finishes connecting (no prompt for the value ever appears, because Cowork isn't trying to resolve one here). Until that's fixed upstream, the source `cowork-plugin/.mcp.json` in this repo keeps `${EMILCRM_INGEST_TOKEN}` as a documented placeholder (so the real token never lands in git), and the **build step that produces `emilcrm-prospecting.plugin` substitutes the real token in before zipping.** See "Rebuilding the plugin" below.

Treat the built `.plugin` file like a credential: it contains your live token in plain text. Don't commit it or share it.

### 3. Connect Apollo

Connect an **Apollo** connector (people/organization search + enrich). In Cowork, add it from the connector catalog (it uses OAuth). The `prospect` skill discovers Apollo's tools at runtime; it doesn't hardcode them.

> Bring your **own** Apollo account. Searches and reveals draw on your Apollo plan and are governed by your Apollo terms — this is also what keeps the model clean if you resell the CRM: each user runs their own Apollo.

### 4. Connect Gmail + Calendar (optional)

For the last mile of the loop, connect a **Gmail** and/or **Google Calendar** connector in Cowork. With them, after sourcing the skill can draft a personalised intro per contact (from the campaign's template), save each as a **Gmail draft** for you to review and send, and propose open meeting slots. Without them, intros are still drafted into EmilCRM (visible in each contact's **Intro email** panel) for you to copy and send. Sending and booking always stay your call.

## Usage

> "Find 25 prospects for the Skåne Hospitality campaign."
> "Who should I add to my pipeline this week? Use my Culture & Events ICP."
> "Source owners of 11–50-person restaurants in Malmö and queue an intro for each."

Claude confirms the ICP, runs the search, writes the results, and tells you how many landed (and where to review them).

## Guardrails

- The plugin **sources and queues** — it never sends email or messages on your behalf.
- It only writes what Apollo actually returned; missing fields stay blank.
- It confirms before large credit-spending reveals.

## Limitations

- Writes merge into EmilCRM's single-document store via read-modify-write. Fine for one user; if the web app is being edited heavily at the same instant, a write could race. Run prospecting when you're not mid-edit.
- Industry filtering falls back to keywords when Apollo industry tag ids can't be resolved.

## Rebuilding the plugin

The git-tracked `cowork-plugin/.mcp.json` keeps `${EMILCRM_INGEST_TOKEN}` as a placeholder — never put the real token there, it would land in git history. The distributable `emilcrm-prospecting.plugin` (repo root, untracked) is built from a staged copy with the real token substituted in:

```bash
cd ~/emilcrm
rm -rf /tmp/emilcrm-plugin-build
cp -r cowork-plugin /tmp/emilcrm-plugin-build
cd /tmp/emilcrm-plugin-build
sed -i '' 's/\${EMILCRM_INGEST_TOKEN}/YOUR_REAL_TOKEN_HERE/' .mcp.json
zip -r /tmp/emilcrm-prospecting.plugin . -x "*.DS_Store" -x "__MACOSX/*"
mv -f /tmp/emilcrm-prospecting.plugin ~/emilcrm/emilcrm-prospecting.plugin
```

Rebuild this way any time the token rotates or `cowork-plugin/` changes, then re-upload the `.plugin` file in Cowork (Customize → Plugins).

## Security

- `INGEST_TOKEN` is a machine credential, separate from the app's login password. Treat it like an API key; rotate it by changing the env var on the app, then rebuild the plugin (see above) with the new value.
- The connector talks to your app over HTTPS and sends the token as a bearer header.
- The built `.plugin` zip contains the real token in plaintext (workaround for the `${VAR}`-in-headers bug above) — don't commit it to git or share the file.

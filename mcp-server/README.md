# emilcrm-mcp

An MCP server that connects **any** AI client — Claude Desktop, Claude Code, Cursor,
Cowork, Windsurf — to your own [EmilCRM](https://emilcrm.com) instance. Say *"find
prospects for my Skåne campaign"* in whatever AI you already use, and Claude sources,
enriches, scores and files them straight into your CRM.

EmilCRM is self-hosted: each person runs their own copy. This server is a small bridge
that forwards tool calls to **your** instance's built-in `/api/mcp` endpoint — so your
pipeline data never passes through anyone else. You point it at your instance; your
customers point it at theirs.

## What you need

1. A deployed EmilCRM instance (see the app's `DEPLOY.md`).
2. `INGEST_TOKEN` set on that instance and redeployed (this turns the prospecting
   endpoints on). Generate one with `openssl rand -base64 32`.
3. Node 18+.

## Configure it in your client

Two env vars:

| Env var | Value |
| --- | --- |
| `EMILCRM_URL` | Your instance base URL, e.g. `https://your-emilcrm.vercel.app` |
| `EMILCRM_TOKEN` | The `INGEST_TOKEN` you set on that instance |

It's published on npm as [`emilcrm-mcp`](https://www.npmjs.com/package/emilcrm-mcp), so
clients run it with `npx` — nothing to install.

### Claude Desktop / Cursor / Windsurf (`mcp.json` style)

```json
{
  "mcpServers": {
    "emilcrm": {
      "command": "npx",
      "args": ["-y", "emilcrm-mcp"],
      "env": {
        "EMILCRM_URL": "https://your-emilcrm.vercel.app",
        "EMILCRM_TOKEN": "your-ingest-token"
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add emilcrm \
  --env EMILCRM_URL=https://your-emilcrm.vercel.app \
  --env EMILCRM_TOKEN=your-ingest-token \
  -- npx -y emilcrm-mcp
```

### Also connect Apollo

Prospecting needs an **Apollo** connector too (your own account) so Claude can search and
enrich. Add it in your client's connector catalog. This server provides the EmilCRM side;
Apollo provides the people data.

## Tools

**Prospecting**

| Tool | What it does |
| --- | --- |
| `emilcrm_get_overview` | Read campaigns + their ICP/search recipe + existing contacts. **Call first.** |
| `emilcrm_add_prospects` | Add scored, suggested prospects to a campaign's discovery pool (reviewed before use). |
| `emilcrm_add_contacts` | Add contacts straight into the pipeline with a first-touch next action. |
| `emilcrm_draft_intro` | Draft personalised intro emails from a campaign template onto contacts. |
| `emilcrm_set_next_action` | Set/replace the next action on existing contacts. |

**Pipeline & calls**

| Tool | What it does |
| --- | --- |
| `emilcrm_get_pipeline` | Read contacts grouped by stage, with next actions and draft/call status. |
| `emilcrm_move_stage` | Move contacts between stages (e.g. to Scheduling, Booked, Lost). |
| `emilcrm_book_meeting` | Book a meeting and advance the contact to Booked. |
| `emilcrm_generate_call_script` | Generate an AI cold-call script (uses the instance's own Claude). |
| `emilcrm_get_calls` | Read logged calls with AI summaries, takeaways and transcripts. |

Duplicates are skipped server-side (by email / LinkedIn / name+company). Booking a meeting
records it in EmilCRM only — it does not create a calendar event or send an invite. The
server never sends email — drafting/queuing is as far as it goes; sending stays your call.

## Security

- `EMILCRM_TOKEN` is a machine credential, separate from the app's login password. Treat it
  like an API key. Rotate by changing `INGEST_TOKEN` on the app and updating the env var here.
- All traffic goes to your own instance over HTTPS, bearer-authenticated. This server keeps
  no state and stores nothing.

## Develop

```bash
npm install
npm run build
EMILCRM_URL=https://your-emilcrm.vercel.app EMILCRM_TOKEN=… npx @modelcontextprotocol/inspector node dist/index.js
```

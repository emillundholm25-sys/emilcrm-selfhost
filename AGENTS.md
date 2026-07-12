<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# EmilCRM working agreement

- **Session ritual:** at session start, read `HANDOFF.md` (and `LAUNCH.md` for launch work) and continue from it. Before ending a session, refresh `HANDOFF.md` with state + ordered next steps (the `/handoff` skill does this).
- **Deploy flow (authorized, no PR review):** commit → push to `main` → Vercel auto-deploys the app. The landing page is a **separate** Vercel project — if `landing/` changed, also run `vercel --prod` from `landing/`. When Emil approves a change, proceed through commit + push + deploy without re-asking. The `/ship` skill encodes this.
- **Swedish-first:** target market is Sweden. All UI and marketing copy in Swedish with an EN toggle; adapt translations so they read naturally, don't translate literally. Prices in SEK.
- **No emojis:** use single-color SVG line icons, never emojis, anywhere in the UI or marketing.
- **No demo data:** never ship example/placeholder contacts or content — this app is in real use.
- **Costs:** prefer free tiers. State clearly whether an option costs money before recommending it.
- **Dev servers** (preview_start): `emilcrm-dev` = app on port 3500; `emilcrm-site` = landing on port 4600. Don't guess other names.
- **Secrets:** belong in `vercel env` or `.env.local`, never in chat or code. Emil is a beginner at ops — when a manual step is unavoidable, give it one step at a time in plain language and wait for confirmation.

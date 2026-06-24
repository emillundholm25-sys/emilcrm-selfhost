# EmilCRM

A **OnePageCRM-style "Action Stream" CRM, reworked around booking meetings.**

OnePageCRM's core idea is simple: every contact has exactly one **Next Action** with a
date, and you work the list top-to-bottom until it's empty. EmilCRM keeps that GTD loop
but orients the whole pipeline around getting meetings booked — from cold lead to held
meeting to won deal.

## The four views

| View | What it does |
| --- | --- |
| **Action Stream** (`/`) | The home screen. Every contact's next action, grouped into **Overdue · Today · Tomorrow · This week · Later · Asap**, plus a "Needs a next action" bucket. Complete an action and it immediately prompts you for the next one — the OnePageCRM loop. |
| **Contacts** (`/contacts`) | Searchable, stage-filterable book of every contact. Star, see next action + due date, value, and stage at a glance. |
| **Meetings** (`/meetings`) | Upcoming meetings grouped by day, plus past meetings. Mark held / cancelled / no-show inline. |
| **Pipeline** (`/pipeline`) | Kanban board across the 8 booking stages. **Drag cards between columns** to move a contact; columns total their potential value. |

A **contact detail** page ties it together: current next action, meeting history,
a full activity timeline, contact details, and a quick note logger.

## Prospecting workflow (LinkedIn → Apollo → CRM)

1. Open **Prospects** (`/prospects`). It derives your **Ideal Customer Profile**
   from your existing contacts — weighted toward booked & won deals — and ranks a
   pool of lookalike candidates by match score, with the reasons for each.
2. Pick a target → find them on LinkedIn → enrich with **Claude-in-Chrome + the
   Apollo connector**.
3. Get the data into the CRM in any of three ways:
   - **Add to pipeline** on a suggested prospect (one click).
   - **Import from Apollo** modal — paste the Apollo person JSON or a LinkedIn
     profile blob; it's parsed into a contact (see [`lib/apollo-parse.ts`](lib/apollo-parse.ts)).
   - Programmatically, for automation:
     ```js
     window.emilCRM.importApollo(apolloPersonJson) // returns the new contact id
     window.emilCRM.addContact({ firstName, lastName, company, industry, ... })
     ```
     Claude-in-Chrome can call these directly via its JS tool — no UI driving needed.

As you add real prospects, the ICP recomputes and the suggestions re-rank.

> Live Apollo *search* from inside the app would need a backend to hold the API
> key — the app derives the ICP and suggests lookalikes, while the Apollo flow
> feeds enriched contacts in. Multi-device sync would likewise need a backend
> (e.g. Vercel Postgres) to replace the `localStorage` store.

## Booking pipeline stages

`To contact → Contacted → Scheduling → Meeting booked → Met → Follow-up → Won / Lost`

Booking a meeting automatically advances the contact to **Meeting booked** and can add a
"prepare" next action on the meeting day. Marking a meeting as held advances it to **Met**.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Zustand** for state, persisted to `localStorage` (seeded with a demo book on first run)
- **lucide-react** icons, **date-fns** for dates

No backend — all data lives in the browser. Use **Reset demo data** in the sidebar to
restore the sample book at any time.

## Run it

```bash
npm install
npm run dev   # http://localhost:3500  (see .claude/dev.sh)
```

## Project layout

```
app/
  page.tsx               Action Stream
  contacts/page.tsx      Contacts list
  contacts/[id]/page.tsx Contact detail
  meetings/page.tsx      Meetings
  pipeline/page.tsx      Pipeline (Kanban)
lib/
  types.ts               Data model (Contact, Meeting, Activity, Stage)
  store.ts               Zustand store + all booking/action logic
  seed.ts                Demo data (generated relative to today)
  utils.ts               Date bucketing & formatting helpers
components/
  app-shell.tsx          Sidebar, nav, hydration gate
  action-row.tsx         Action Stream row (the complete → next-action loop)
  meeting-card.tsx       Shared meeting row
  modals.tsx             Add contact / Set next action / Book meeting
  ui.tsx, modal.tsx, ... primitives
```

> Note: this project targets **Next.js 16**, which has breaking changes vs. earlier
> versions. See `AGENTS.md` and the bundled docs under `node_modules/next/dist/docs/`.

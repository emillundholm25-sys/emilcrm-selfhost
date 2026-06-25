---
name: prospect
description: Runs the full outbound prospecting loop for EmilCRM. Use when the user says "find prospects", "find leads", "prospect for [campaign name]", "fill my pipeline", "who should I reach out to", "source contacts for my ICP", or otherwise wants new people sourced into their CRM. Reads a campaign's ICP, searches and enriches with the Apollo connector, writes scored prospects (or pipeline contacts with first-touch next actions) into EmilCRM via its connector, and can draft personalised intros from the campaign template (saving them as Gmail drafts for the user to send). Requires the EmilCRM connector and an Apollo connector.
---

# Prospect for EmilCRM

Turn a campaign's Ideal Customer Profile into real, enriched people in the CRM. The user defines the ICP; you run search → enrich → dedupe → score → write. Stay economical with Apollo credits and keep the user in control of outreach.

## Prerequisites (check once, early)

- The **EmilCRM connector** must be available (tools prefixed `emilcrm_`). If calls fail with a config error, tell the user to set `EMILCRM_INGEST_TOKEN` (see the plugin README) — do not continue blindly.
- An **Apollo connector** must be connected (people/organization search + enrich). If it isn't, ask the user to connect Apollo before continuing.

## The loop

### 1. Read the target

Call `emilcrm_get_overview`. It returns every campaign with its `targetICP`, a ready-built `searchRecipe` (industries / sizes / locations / titles), per-campaign counts, and the existing contacts.

- If the user named a campaign, use it. Otherwise, if there's one obvious active campaign, use it; if several, ask which one.
- Note the existing contacts so you don't re-surface people already in the pipeline (the CRM also dedupes server-side as a backstop).

### 2. Confirm the ICP

Look at the chosen campaign's `searchRecipe`.

- If `hasSignal` is true, briefly restate the recipe to the user ("Searching Apollo for Marketing Directors / Owners at 11–200-employee hospitality companies in Skåne — go?") and proceed on confirmation.
- If `hasSignal` is false (a new campaign with no defined ICP and no contacts yet), ask the user for industries, company sizes, locations, and titles. Do not invent an ICP.

### 3. Search Apollo

Translate the recipe into an Apollo people search. See `references/apollo-search.md` for the field mapping, which Apollo tools to use, and pagination. Pull a sensible first batch (default ~25 people) unless the user asks for more.

### 4. Enrich

Reveal email and phone for the candidates you intend to keep. Revealing costs Apollo credits — if the batch is large, confirm with the user first, and prefer to enrich only the people who clear a basic ICP fit. Details in `references/apollo-search.md`.

### 5. Score & select (optional)

The CRM scores prospects against the campaign ICP automatically once written, so you don't have to. If the user wants a shortlist first, rank by how well each person matches the recipe's industries/titles/sizes/locations and present the top names before writing.

### 6. Write into the CRM

Pass the **raw Apollo person objects** straight through — the CRM parses names, title, company, email, every phone number, and firmographics itself. See `references/emilcrm-api.md` for exact payloads.

- **Default → `emilcrm_add_prospects`**: lands people in the discovery pool as scored, *suggested* prospects for the user to review on the Prospects page. This is the safe default.
- **Only if the user wants them worked immediately → `emilcrm_add_contacts`** with a `nextAction` (e.g. "Send personalised intro to book a meeting"). These appear in the Action Stream right away.

Always pass the `campaignId` you selected in step 1.

### 7. Draft intros (when you added contacts)

If you added people as **contacts** and the user wants first-touch outreach prepared, call `emilcrm_draft_intro` with the `contactIds` that `emilcrm_add_contacts` returned. It fills a campaign email template — merge fields like `{{firstName}}`, `{{company}}`, `{{title}}` are substituted per contact — saves a personalised draft on each (visible in the app's **Intro email** panel for the user to review and send), and returns the rendered subject + body.

- A campaign can hold several named templates (`emailTemplates` in `emilcrm_get_overview`). If there's more than one, ask the user which to use and pass its `id` as `templateId`; with one (or none — a sensible default is used) just omit it.
- **Gmail (optional):** if a Gmail connector is connected, save each returned draft as a **Gmail draft** (create draft only — never send). The user reviews and sends from Gmail. With no Gmail connector, the draft still lives in EmilCRM to copy/send.
- **Calendar (optional):** if a Google Calendar connector is connected and the user wants to offer times, propose a few open slots to weave into the draft or a follow-up — but **booking stays the user's call**; you can also `emilcrm_set_next_action` to queue "Propose 2–3 times".

### 8. Report

Summarise: how many were added (and as prospects vs contacts), how many were skipped as duplicates, how many intros were drafted (and whether Gmail drafts were saved), and the standout matches by ICP fit. Point the user to the right view — the **Prospects** page (to review/promote) or the **Action Stream** / a contact's **Intro email** panel (if you added contacts and drafted). Offer the next batch.

## Guardrails

- **Never send outreach.** This skill sources, drafts, and queues — it does not email, message, or connect on anyone's behalf. Saving a *draft* (in EmilCRM or as a Gmail draft) and setting a *next action* are fine; actually sending, or booking a meeting, is the user's job (or a separate, explicitly-authorised step).
- **Respect Apollo credits and terms.** Reveal only what you need; confirm before large batches. The user's own Apollo account and its terms govern usage.
- **Don't fabricate people or data.** Only write what Apollo actually returned. If a field is missing, leave it blank — the CRM shows directory-lookup links to fill gaps later.
- **One campaign at a time** unless the user explicitly asks to prospect across several.

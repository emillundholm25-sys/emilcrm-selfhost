# EmilCRM connector tools

Four tools, exposed by the app's remote MCP endpoint (`/api/mcp`) and backed by the same ingest logic. Duplicates are skipped server-side (by email / LinkedIn / name+company), across both the prospect pool and the contact list.

## `emilcrm_get_overview` (read)

No arguments. Returns:

```jsonc
{
  "campaigns": [
    {
      "id": "…",
      "name": "Skåne Hospitality",
      "status": "active",
      "targetICP": { "industries": [...], "companySizes": [...], "locations": [...], "titles": [...] } | null,
      "derivedFrom": "defined" | "contacts",
      "searchRecipe": { "industries": [...], "sizes": [...], "locations": [...], "titles": [...], "hasSignal": true, "copyText": "…" },
      "counts": { "contacts": 12, "prospects": 30 }
    }
  ],
  "contacts": [ { "id", "name", "company", "email", "linkedinUrl", "stage", "campaignId" } ],
  "counts": { "contacts": 12, "prospects": 30, "campaigns": 2, "meetings": 4 }
}
```

Use `searchRecipe` to drive the Apollo search. Use `contacts` to avoid resurfacing known people.

## `emilcrm_add_prospects` (write — default)

```jsonc
{
  "campaignId": "…",          // from get_overview; omit → first active campaign
  "people": [ { /* raw Apollo person object */ } ]
}
```

Lands each person in the discovery pool as a **suggested** prospect, scored against the campaign ICP. The user reviews them on the Prospects page and promotes the good ones. Returns a report with `addedProspects`, `skipped` (with reasons), and `counts`.

## `emilcrm_add_contacts` (write — only when working immediately)

```jsonc
{
  "campaignId": "…",
  "people": [ { /* raw Apollo person object */ } ],
  "nextAction": "Send personalised intro to book a meeting",
  "nextActionDate": "2026-06-24"   // optional; defaults to today
}
```

Creates pipeline contacts in the **To contact** stage, each with the given first-touch next action so they appear in the Action Stream. Returns `addedContacts`, `skipped`, `counts`.

## `emilcrm_set_next_action` (write)

```jsonc
{
  "nextActions": [
    { "contactId": "…", "action": "Call to propose meeting times", "date": "2026-06-25" }
  ]
}
```

Sets/replaces the next action on existing contacts (omit `date` for "Asap").

## Choosing prospect vs contact

- Default to **prospects** — it keeps the user in the loop (they review before anyone enters the pipeline).
- Use **contacts** only when the user explicitly says to start working the results now. Always attach a `nextAction` so they don't land actionless.

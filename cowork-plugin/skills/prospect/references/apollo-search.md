# Apollo search & enrich

How to turn an EmilCRM `searchRecipe` into an Apollo people search, then reveal contact details. Exact tool and parameter names come from the connected Apollo connector — read its tool schemas; the names below are the common Apollo API shapes as a guide.

## 1. People search

Use the Apollo people-search tool (commonly `apollo_mixed_people_api_search`, the People Search API). Map the recipe fields:

| Recipe field | Apollo parameter (typical) | Notes |
| --- | --- | --- |
| `titles` | `person_titles[]` | Job titles, e.g. `["Marketing Director","Owner"]`. Apollo matches loosely. |
| `locations` | `person_locations[]` | City/region/country strings, e.g. `["Lund, Sweden","Malmö, Sweden"]`. |
| `sizes` | `organization_num_employees_ranges[]` | Convert bands to Apollo ranges: `1-10`→`"1,10"`, `11-50`→`"11,50"`, `51-200`→`"51,200"`, `201-1000`→`"201,1000"`, `1000+`→`"1001,100000"`. |
| `industries` | `q_organization_keyword_tags[]` or `organization_industry_tag_ids[]` / `q_keywords` | Apollo keys industries by tag id. If you can't resolve tag ids, fold the industry into `q_keywords` (e.g. `"hospitality"`). |

Other useful params: `page` and `per_page` (default to ~25 per page), `contact_email_status[]` = `["verified"]` to bias toward reachable people.

Keep the first pull modest (one page) and show the user before pulling more.

## 2. Filter to ICP fit

From the page of results, drop obvious misses (wrong country, clearly off-target company) before spending credits on reveals. You don't need to score precisely — EmilCRM scores each prospect against the campaign ICP automatically once written.

## 3. Reveal email & phone

Search results often omit personal emails/phones until you reveal them, which **consumes Apollo credits**. Use the match/enrich tool (commonly `apollo_people_match` or `apollo_people_bulk_match`) for the people you intend to keep.

- For a batch, prefer the bulk variant in one call.
- If the batch is large (say > 25 reveals), confirm with the user first — it's their credits.
- Request phone reveal explicitly if the tool gates it behind a flag (e.g. `reveal_phone_number: true`); EmilCRM captures every direct/mobile number plus the org HQ line.

## 4. Hand the raw objects to EmilCRM

Do **not** reshape Apollo's JSON. Pass each person object (with its nested `organization` and `phone_numbers`) straight into `emilcrm_add_prospects` / `emilcrm_add_contacts`. EmilCRM's parser reads `first_name`, `last_name`, `title`, `email`, `phone_numbers[]`, `linkedin_url`, `city`/`country`, and `organization.{name,industry,estimated_num_employees,phone}` itself.

## Credits & terms

Apollo searches and reveals draw on the user's Apollo plan and are governed by the user's Apollo terms. Be economical, reveal only what's needed, and never bulk-export beyond what the user asked for.

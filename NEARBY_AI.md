# Nearby research — free providers

Nearby entry points on Itinerary, Daily itinerary, Today, Map and Suggestions open one themed popup. Itinerary and Map pass their selected day/event. Account research uses the current database snapshot; samples show context without calling external providers. Nothing is automatically added to the itinerary.

## Workflow and evidence

1. Supabase verifies the user and loads the trip using existing membership checks. It rejects changed revisions and out-of-trip dates. Removed/pending travelers are excluded. Client-supplied preferences are ignored.
2. The server builds group and requester context: preferences, selected-day plans, area, budget reservations and time gaps. Identical answers are counted together without dropping constraints. Account names, emails and expense records are excluded; shared planning text is included.
3. Tavily makes exactly two basic searches for the public area/category and curated dietary or interest keywords, with auto-parameters, generated answers, images and raw extraction disabled. It receives no raw preference notes, identities, budget figures or itinerary.
4. Groq uses openai/gpt-oss-20b (hosted by Groq, not the OpenAI API) with strict JSON output to rank up to three candidates from retrieved excerpts. If the first valid response has an empty candidate list, the server makes exactly one bounded recovery call with the same excerpts and constraints. It never searches again or relaxes constraints. There are no AI browsing tools or paid-provider fallbacks.
5. Every retained fact must reference a retrieved HTTPS URL, name a venue present in the source text/title, and include a short exact quote found in that excerpt. The displayed fact text is the quote itself; walking-distance claims are excluded. Unsupported addresses/prices stay unconfirmed, and model-written suitability explanations are replaced with neutral review wording. Known model-reported conflicts, duplicates, invalid values and known USD overspending are rejected. An excerpt match does not independently prove a venue meets the group's needs.
6. All candidates remain in Options to review, with source links and unresolved concerns. They are not bookings or verified suitability. Fewer than three results, including none, is valid.

## Free allowances

- Five attempted generations per authenticated user per UTC day, across all their trips.
- One generation per minute and a 192,000-token reservation ceiling per UTC day across the project (up to 12 new generations at the new reservation size).
- 500 attempted generations per UTC calendar month across the project, reserving two Tavily credits per attempt (1,000 credits/month).
- Each new attempt reserves 16,000 Groq tokens to cover the initial call and one bounded recovery call. The daily project gate allows 12 new attempts (192,000 reserved tokens) against the documented base free 200,000/day allowance. Existing 8,000-token reservations remain counted at their original size. Account-specific limits may be lower. Recovery is only called for an empty candidate array and is capped at 900 completion tokens.
- Schema and all group constraints must fit before any reservation/search. Excerpts are shortened to fit the remainder. Oversized planning contexts receive an explicit error, without silently dropping travelers or constraints.
- Failed or interrupted attempts keep their reservations because external quota may already have been consumed. This intentionally sacrifices some available capacity. The ledger stores only account ID, timestamp, reserved counters and outcome. Account deletion anonymizes its rows while preserving shared quota counters.
- Both provider accounts must stay on their Free plans, with no paid billing/overage enrollment. Use dedicated accounts/projects where possible; other apps sharing the accounts consume the same quotas. Provider quota errors pause research without automatic retry.

The migration enforces these limits atomically with a project-wide transaction lock. Only the Edge Function's service identity can reserve/finish a generation. Authenticated users can only request authorized trip context. Local PostgreSQL tests cover applying the migration, user/day/month/minute gates, overlapping reservations, role permissions and retained failure reservations; live limits still require verification after deployment.

## Setup and deployment

User confirmed GROQ_API_KEY and TAVILY_API_KEY were saved in the existing Supabase project's Edge Function Secrets on November 13, 2026. Provider secret values were not retrieved. No OpenAI key is required.

1. Authenticate the Supabase CLI against project mzwydinhvgmwhnwlomnn.
2. Apply only supabase/migrations/20261112234000_nearby_research.sql after checking the target migration history. Do not apply unrelated pending migrations automatically. This migration was never deployed in its earlier OpenAI draft form; if that changes, stop and write an additive upgrade migration.
3. Deploy nearby-suggestions. Its handler verifies every caller with Supabase auth.getUser(); if the gateway requires --no-verify-jwt for publishable keys, application JWT verification remains mandatory.
4. Verify secrets by name only, then enable NEARBY_AI_ENABLED=true. Supabase supplies SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to hosted functions. No private keys belong in VITE_ variables or source control.
5. Exercise real owner/viewer research, denied cross-trip access, source quality and provider quota handling before public release. Record actual deployment and live verification below; do not infer them from mock checks.

Deployment/live verification (November 13, 2026): completed against mzwydinhvgmwhnwlomnn. The project has no CLI migration-history table; only the reviewed SQL file was applied directly after confirming the new objects were absent. The additive retention migration 20261113182000_nearby_quota_retention.sql is also applied, preventing account deletion from resetting project counters. The function is deployed with NEARBY_AI_ENABLED=true, and its handler validates JWTs itself. Deployment command: npx supabase functions deploy nearby-suggestions --remote=mzwydinhvgmwhnwlomnn --use-api --no-verify-jwt --yes.

The final real browser → Edge Function → database → Tavily → Groq check returned a Cafe Flora candidate with quoted vegetarian evidence from the venue's own website. Unsigned callers and cross-trip access were rejected, an immediate repeat was quota-blocked, and temporary accounts/trips were removed. A prior provider attempt failed and returned a recoverable error; no automatic retry was used. This is a connection/evidence-path check, not a guarantee of every recommendation's suitability. Frontend publication follows the normal main-branch GitHub Pages workflow.

## Planning limitations

The scheduler uses the trip timezone, excludes past times, and proposes free gaps within lunch (11:00–15:00), dinner (17:00–21:00), or activity (09:00–20:00) windows, with provisional 30-minute travel buffers. Recorded expenses plus planned costs are conservatively reserved and may double count purchases. Source prices in foreign currencies remain budget-uncertain. Source timestamps indicate research time, not that the venue updated its information then.

Before automatic scheduling can be called reliable, add independently checked routes/walking distances, date-specific hours, availability/group capacity, dietary/allergen and accessibility confirmation, taxes/currency conversion and per-destination timezones. The model's conflict labels alone are insufficient. Prefer official venue pages, and retain uncertainty when sources are incomplete or contradictory. Do not scrape/train on Google/Yelp reviews; additional licensed integrations need their own approved access.

## Local checks

- npm run build
- node --experimental-strip-types --test src/nearby-research.test.ts src/nearby-providers.test.ts
- npx --yes deno check supabase/functions/nearby-suggestions/index.ts
- npm exec --yes --package=@electric-sql/pglite -- node scripts/test-nearby-ledger.mjs
- Focused desktop/mobile Nearby journeys in tests/nearby-research.spec.ts and tests/refinement.spec.ts.

Sources: [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Groq limits](https://console.groq.com/docs/rate-limits), [Tavily search](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Tavily credits](https://docs.tavily.com/documentation/api-credits).

## Location and empty-result refinement (November 13, 2026)

Venue-only location text is qualified with the relevant trip destination (for example, McDonald’s · Seattle). A city already present in a saved address is retained, and a neighboring itinerary event may disambiguate a multi-destination trip. Complete saved addresses outside the destination list are preserved. The popup flags incomplete venue addresses rather than implying a specific branch is resolved. No extra geocoding or paid lookup is introduced.

Successful empty responses include a specific reason: missing area, no planning time, no usable sources, no AI candidates, insufficient evidence, budget conflicts, flagged preference conflicts, duplicates, invalid details or a mixture of filters. Search details expose only aggregate source/candidate/rejection counts, not source text, queries, personal notes or hidden model reasoning. Counts record the first removal reason for each candidate. Provider and quota failures remain errors rather than empty results.

Verification: production build, Deno type check, 16 unit/handler checks and 8 desktop/mobile browser checks passed. The deployed live QA scenario used McDonald’s · Seattle, WA, zero shared preferences and Things to do. Five sources were retrieved, four excerpts were used, three candidates were returned, one was removed for insufficient evidence and two were displayed. Immediate repeat was quota-blocked; temporary QA accounts and trips were removed.

## Supplemental Yelp research and listing links (November 13, 2026)

The same two-basic-search allowance now covers one venue/official-tourism-oriented web search plus one domain-restricted public Yelp search. Retrieved Yelp excerpts are supplemental; the model is instructed to prioritize venue/official-tourism information and never use reviews as proof of dietary safety or accessibility. A failed optional Yelp lookup preserves primary search evidence (except credential/quota failures, which still stop research). No extra requests, raw extraction, Yelp API key, Google Places API call or paid fallback is introduced. The model context interleaves web and Yelp excerpts within its existing free token limit. Search details reports Yelp availability and the number of its excerpts actually used.

Each candidate includes an API-key-free Google Maps search link and a Yelp link. The latter uses a business URL only when that URL was cited in retrieved evidence; otherwise it opens a name/location search. Links are encoded and restricted to their intended domains. They do not imply an exact business match or access to full review collections. Existing evidence checks and uncertainty labels still apply.

Live verification: the deployed supplemental-search flow retrieved six sources and used six excerpts, including three from Yelp. It returned three review candidates (Cafe Flora, Aerlume and Ba Bar Green), with venue-site citations for the first two and Yelp citations for the third. Both listing links were verified in the browser, access checks and immediate-repeat quota blocking passed, and temporary QA data was removed. Production build, Deno checking, 20 unit checks and 10 desktop/mobile checks passed.

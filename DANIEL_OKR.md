# Daniel OKR #1 — saved-plan engagement

Objective: help trip planners save and share trips with friends. Target: **85% of enrolled planners access a saved plan at least every other day** over the last **14 completed UTC days**. The admin dashboard lives at `#/21` under Daniel's OKR. The dashboard fixes the measurement to this confirmed window and denominator.

Once an official result is available, the dashboard shows one return-rate ring, target status, the consistent/eligible user counts, and one rolling return-rate chart with an 85% reference line. A collapsed explanation defines eligibility and cadence. Adoption, sharing, daily activity, comparison filters and extra totals are omitted in this view to keep the page focused on OKR #1. Empty denominators show an unavailable percentage; genuine zero rates show 0%. Missing history is not drawn as zero. An accessible return-rate table expands on demand.

While the official result is unavailable, the dashboard now shows **Preliminary** data instead of empty charts. With fewer than two complete days (or no eligible short-window planners), the ring shows today's visitors divided by enrolled planners, explicitly labeled daily activity. With at least two complete days and eligible planners, it shows cadence over the available completed-day window, capped at 14 days. The same no-two-inactive-days rule applies, and users must be enrolled before that shorter window begins. Preliminary results never claim “Target met.” Once available, the official 14-day score replaces the preliminary ring automatically.

During baseline collection, one daily activity chart replaces the empty return-rate chart. It includes real visits on the partial launch day and today, both marked partial, plus complete observed days. These partial days never enter either cadence calculation. Refresh preserves chart inspection and expanded details. The additive `preliminary` response contains `windowStart`, `windowEnd`, `observedDays`, `eligiblePlanners`, `consistentPlanners`, `retentionPercent`, and completed/launch-day `daily` counts; today's count remains `activeToday`. Migration: `20261115052105_daniel_okr_preliminary_metrics.sql`. Existing official fields and admin authorization are unchanged.

Automatic refresh preserves expanded details and keyboard focus. Failed or denied requests remove previously displayed metrics. The backend still supports its existing comparison fields and alternate windows for compatibility.

## Metric definition

A planner enrolls on their first real account-owned trip or accepted shared-account membership. Existing planners were enrolled when collection began. Enrollment persists after trip deletion, membership removal, or inactivity; removing inactive people would inflate the rate. `currentPlanners` separately counts accounts that currently own or can access a trip. Account deletion cascades all of that account's telemetry and enrollment.

An eligible planner must have been enrolled at or before midnight at the beginning of the entire selected window. Their cadence passes only when **every pair of consecutive days in that window contains at least one plan access**. Alternating days pass. Seven visits clustered into the first seven days of a 14-day window fail. Two adjacent inactive days fail. Multiple visits on a day cannot improve the score. Today is excluded because it is incomplete.

The percentage is `100 × consistentPlanners / eligiblePlanners`, rounded to one decimal place. Zero eligible planners returns JSON `null`, displayed as unavailable rather than 0% or 100%. All-account comparison uses the same observation and cadence rules, including registered accounts that have not yet saved/shared a trip.

## Collection and baseline

Collection began **2026-11-14 at 19:13:05.037349 UTC**. No historical visits were inferred from account creation, saved trips, or sign-in timestamps. The first partial collection day is excluded from full-day charts and evaluation. The first fully observable day is November 15; existing enrolled planners can first have a complete 14-day result at **2026-11-29 00:00 UTC**. Later enrollments qualify later. Daily and trend arrays omit pre-collection days instead of drawing fabricated zero activity.

At launch, no planner had a complete observation window, so the retention rate was null. Current account and trip totals are available only through the authorized dashboard; launch validation evidence remains outside the public repository.

The client records visible, authenticated, persisted plan views on Itinerary, Today, Day & map, and full Map. Demo/sample sessions, unsaved trips, account/admin pages and background polling do not count. Foreground/navigation/interaction checks are throttled; the server independently deduplicates by account and UTC day. A failed telemetry request does not block planning. Older bundles, offline visits and blocked requests are not retroactively reconstructed. As with ordinary product analytics, authenticated access signals measure use of the application, not proof that someone read every plan detail.

## Data and authorization

Migration: `supabase/migrations/20261114190616_daniel_okr_plan_engagement.sql`.

- `private.plan_tracking_settings`: collection start timestamp.
- `private.plan_user_cohort`: Auth user UUID, observed account enrollment, first planner enrollment.
- `private.plan_access_day`: Auth user UUID, server-calculated UTC date, most recent server timestamp for that date. One primary-key row per user/day. No trip ID, route history, email, name, location, device identifier or trip content is stored in the activity ledger.

All three tables have RLS enabled and no `anon`/`authenticated` table grants. Public RPC wrappers are security invokers; privileged helpers are in the unexposed private schema with fixed empty search paths and explicit execute grants. There is no client-accessible enrollment or historical-write endpoint.

`record_trip_plan_access(p_trip uuid)` accepts only a trip ID and returns `true` on success. It derives the actor from `auth.uid()`, verifies a current non-anonymous Auth account and real persisted ownership or accepted shared-account membership, then records server time. A client cannot choose another user or backdate activity. Removed collaborators immediately lose the ability to record access, while their enrollment remains in the denominator.

`get_daniel_okr_metrics(p_days integer default 14)` accepts only 7, 14 or 30. It checks the existing `private.is_admin()` guard on every request, so removal from the approved Google-email list takes effect without refreshing a JWT. It returns aggregate counts and percentages, never account or trip details. User-editable metadata does not grant access. The UI hides the page for non-admins, but the database authorization is the security boundary.

Shared trips require a real owner plus at least one different real account with an accepted shared membership. Pending invitations, the owner alone, and fictional guest travelers do not count. Ivy's existing OKR #2 implementation and RPC were preserved.

## Response contract

The flat JSON contains `trackingStartedAt`, `windowStart`, `windowEnd`, `windowDays`, `observedDays`, `targetPercent`, `registeredUsers`, `planners`, `currentPlanners`, `savedTrips`, `sharedTrips`, `sharingOwners`, `acceptedCollaborators`, `eligiblePlanners`, `consistentPlanners`, `eligibleUsers`, `consistentUsers`, `retentionPercent`, `allUserRetentionPercent`, `activeToday`, `activeYesterday`, `activeInWindow`, `newPlanners`, and `lastActivityAt`.

`daily` contains `{date, activeUsers}` for completed observed dates in the selected window. `trend` additionally contains `{date, eligiblePlanners, consistentPlanners, percent, eligibleUsers, consistentUsers, allUserPercent}`, evaluating the same rolling window at each date. The frontend validates the headline and daily contract before display. Percentage and last-activity values may be null; counts are nonnegative integers. Dates use `YYYY-MM-DD` and timestamps use ISO 8601.

## Verification and deployment

The additive migration was applied to the existing hosted project in one transaction, then verified through catalog checks. Existing trip data and access policies were not rewritten. This project has no `supabase_migrations.schema_migrations` ledger; the existing project workflow uses reviewed SQL plus source-controlled migration files and external apply evidence. Reapplication is guarded by object existence.

- `scripts/test-daniel-okr.mjs`: 28 isolated PostgreSQL checks covering launch nulls, preliminary cadence and partial days, alternating/clustered/missing-day cadence, denominator enrollment, deletion, UTC dating, deduplication, role grants and immediate revocation. Run with `npm exec --yes --package=@electric-sql/pglite -- node scripts/test-daniel-okr.mjs`.
- `scripts/test-live-daniel-okr.mjs`: 17 hosted checks covering real REST owner/shared access, outsider/anonymous denial, spoofed metadata denial, caller-chosen identity/date rejection, supported windows, admin revocation, private table RLS/ACLs and invoker/definer boundaries. Run with `node --experimental-strip-types scripts/test-live-daniel-okr.mjs` using ignored existing project credentials.
- Live checks created three disposable accounts and one trip, with a database-created Google identity solely as an admin authorization fixture. They did not test Google's OAuth delivery. Every test identity, approval, profile, trip, activity row and enrollment row was removed; no email was sent.
- The clean aggregate snapshot successfully parsed through `src/okr1.ts` after cleanup. Account creation and owner/member enrollment triggers were exercised against the live database.
- The project-wide Supabase security-advisor endpoint was attempted but the existing scoped token lacks `advisors_read`. No credential scope was expanded. Targeted catalog, role and RPC checks passed; this is not a claim that a full project-wide advisor audit passed.

External evidence is under `outputs/daniel-okr-2026-11-14/` in the workspace and is intentionally excluded from the public source repository. Frontend build, browser and Pages release evidence is recorded separately by the release lead.

Current Supabase references checked: [database functions](https://supabase.com/docs/guides/database/functions), [RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [CLI v3 hosted-target changes](https://supabase.com/changelog/supabase-cli-v3), and [scoped token permissions](https://supabase.com/docs/guides/platform/personal-access-tokens).

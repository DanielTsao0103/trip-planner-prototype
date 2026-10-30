# Supabase setup

Project reference: `mzwydinhvgmwhnwlomnn`.

## Local credentials

| File | Variables | Purpose |
| --- | --- | --- |
| `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser authentication and account trips |
| `.env.server.local` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Private administration/testing; never bundled |
| `.env.supabase.local` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | Database management |

These files are ignored by Git. Keep the tracked example files as placeholders. Only the publishable key belongs in a `VITE_` variable. Restart Vite after editing environment files. `npm run supabase:check` checks the three connections without printing credentials or modifying data.

## Working login slice

1. Open the local app and choose **Create an account**.
2. Enter a name, email, and password of at least eight characters.
3. Signup signs you in immediately and opens the demo app. Email confirmation is disabled for this prototype at Dan's request.
4. Sign out, then log back in with the same email and password. Refreshing preserves the Supabase session.

Each signup creates `auth.users` and a corresponding `public.user` profile through the private `create_account_profile` trigger. The profile uses the Auth UUID as `userID`; passwords never enter the public profile. The existing five sample users were preserved as group records and are not login accounts.

`src/auth.tsx` authenticates the real account, then `src/prototype.tsx` renders the original app. Demo data is loaded from a per-account browser save or the built-in fixture. Older `trip-planner-v1` saves are copied without changing the original. Account trip details load through `src/account-trips.ts`. Supabase saves the complete account trip and its relational planning records. Existing browser details import once only for an already-owned database trip; matching email never establishes ownership. Samples remain browser-local.

## Schema correction

`supabase/migrations/20261010194129_auth_only_lucid_schema.sql` records the one-time correction applied to this existing project through the Management API on October 10, 2026. It removes the earlier planner implementation, renames the two creator columns to match Lucidchart Page 1, and adds only profile creation and profile-read access. It is not a fresh-project bootstrap and must not be rerun against the already-corrected project. No CLI migration-history baseline has been established.

All original group records were checked by fingerprints before and after the correction. The two unused role records introduced by earlier QA were removed by exact ID. All five public tables retain RLS. This was the auth-only access model before the account-trip migrations below.

## Later

When email verification is added, configure a custom SMTP provider and the app's exact redirect URLs before enabling Confirm email. Supabase's default SMTP only sends to project-team addresses. No email provider, social login, or password-reset feature is part of this slice.

## Account-trip slice (October 28, 2026)

Applied to the existing team project, in order:

- `20261029014726_account_owned_trips.sql`: destinations array, revision counter, trip validation, owner access policies, and indexes.
- `20261029015038_trip_owner_membership.sql`: explicit `owner_id` referencing Auth, unique memberships and role names, Owner role, and atomic owner-membership trigger. It aborts if existing Auth-owned trips need a backfill; the inspected project had none.

These are applied history, not commands to rerun on this project. They were executed transactionally through the Management API; the project still has no CLI migration-history baseline. Establish a reviewed baseline before using `db push` or bringing up a fresh project. Existing legacy rows were preserved without guessing ownership.

`owner_id` is the owning account; `created_by` retains creator history. Browser clients cannot change either field after creation. The original privileged trip function is a private trigger with a fixed search path and explicit `auth.uid()` checks; it inserts exactly one Owner membership in the same transaction. No client can insert or alter memberships/roles. Future invitations should add accepted Editor/Viewer memberships, then extend RLS for their specific capabilities; they must never replace the owning account. Editable-day assignments now use a separate membership/day relation.

The UI waits for a confirmed save, retains failed form input, uses the same UUID for creation retries, checks revisions on edits/deletes, and loads account trips independently of browser storage. The full-detail extension below also syncs events, expenses, preferences, guest traveler records, and reminders.

For opt-in live verification, run the production preview on port 4173 and `npm run test:live-trips`. The script creates two temporary Auth accounts, proves cross-account isolation and fresh-browser persistence, and removes their trips, memberships, profiles, and accounts. It needs the ignored server secret; it never prints credentials.

Security advisor: the CLI could not connect via IPv6, and the documented hosted advisor endpoint returned `403` because the existing scoped token lacks `advisors_read`. No wider token was requested. Live adversarial API tests verified the relevant access controls.

## Full trip details (October 28, 2026)

Applied after the original slice and the shared text-limits migration:

- `20261029021150_complete_trip_persistence.sql`: additive root/member/event fields; normalized member-day, attendee, expense/share, individual-budget, preference, reminder, and dismissed-suggestion tables; RLS; validated atomic save/load functions.
- `20261029022743_trip_financial_cascade_integrity.sql`: deferred participant foreign keys permit whole-trip deletion while retaining financial integrity.
- `20261029024500_trip_conflicts_and_date_integrity.sql`: HTTP `PT409` revision conflicts, child-date guards, and restricted direct root-column writes.
- `20261029030500_invalidate_trip_retry_hash.sql`: older metadata-only writes invalidate the aggregate retry receipt.
- `20261029032000_removed_traveler_day_validation.sql`: former Day Editors no longer prevent shortening a trip once their assigned days are removed.

The public RPC wrappers run as invoker. Only their specific private implementations are executable by authenticated accounts; each privileged entry point checks `auth.uid()` and ownership, with an empty search path. The new tables expose owner-filtered reads; direct client writes are revoked. A complete trip save is one transaction with an optimistic revision check and idempotent lost-response retry. It validates dates, roles, amounts in integer cents, references, nonoverlap, and split totals. Settled allocations cannot be silently edited, unmarked, or removed.

`trip_member.userID` is reserved for real linked accounts. Guest travelers have a separate UUID `planner_id`, a name/email, role, and status; their `userID` stays NULL even if the email matches a registered user. Removing guests keeps historical expense references. Real invitation acceptance, collaborative RLS, ownership transfer, and simultaneous multi-user merge remain future work.

Only unsaved recovery drafts and independent demo state remain in local storage after loading account trips. Old fixture participant/event IDs are remapped during one-time import, without claiming accounts. Conflicts require explicit user retry/reload; failed writes never silently overwrite the server. Actual upload storage/OCR, notification delivery, and payment movement are not part of this persistence feature.

Do not raise `40001` for business conflicts: [Supabase documents a PostgREST retry-loop issue](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions). The live regression verifies `PT409` returns promptly. All migrations above were applied transactionally through the Management API, with no reset or inference of legacy ownership.

## Google sign-in (October 29, 2026)

The **Sign in with Google** button runs Supabase OAuth with the PKCE flow (`src/supabase.ts`), so Google returns to the app as `?code=...` and never touches the `#/page` routing. Apple stays a prototype preview.

One-time setup, done in dashboards (no secrets go in this repo):

1. Google Cloud: OAuth consent screen (External, scopes `openid`, `email`, `profile` only), then an OAuth client of type Web application. Authorized JavaScript origins: `https://danieltsao0103.github.io` and `http://127.0.0.1:5190`. Authorized redirect URI: `https://mzwydinhvgmwhnwlomnn.supabase.co/auth/v1/callback`. While the app is in Testing mode, add each teammate as a test user.
2. Supabase: Authentication, Sign In / Providers, Google: enable it and paste the Client ID and Client secret.
3. Supabase: Authentication, URL Configuration: allow `https://danieltsao0103.github.io/trip-planner-prototype/` and `http://127.0.0.1:5190/`.
4. Run `supabase/migrations/20261030022000_google_signin_profile.sql` once (same Management API or SQL editor route as the earlier migrations). It only replaces the profile trigger function so new Google accounts store `provider = 'google'` and use Google's name when the form name is missing. Not applied until someone runs it.

A Google account whose email matches an existing email/password account is linked to it by Supabase and keeps that account's profile row. Gmail reading is not part of this slice.

## Forwarded booking emails (October 29, 2026)

Dan approved this on October 29, 2026. People forward a confirmation email to a Mailtrap inbound address; an Edge Function saves the extracted fields; Home shows them. Free tiers only, no custom domain, no AI parsing.

How it works: Mailtrap receives the email and calls the `inbound-email` Edge Function as a nudge. The function ignores the webhook body, asks the Mailtrap API for the newest messages, skips ones already in `inbound_email_log`, and saves a booking only when the sender address equals exactly one account's email. Only the extracted fields (type, title, dates, place, confirmation code) are stored, never the whole email. Sender addresses can be faked, so this proves "someone knew this account's email", not identity. Treat saved bookings as unverified notes.

One-time setup:
1. Run `supabase/migrations/20261030031500_forwarded_bookings.sql` (SQL editor). Creates `forwarded_booking` and `inbound_email_log` with row-level security: accounts can read and delete only their own rows, and only the function can add rows. Not applied until someone runs it.
2. Deploy `supabase/functions/inbound-email` (dashboard: Edge Functions, Deploy a new function, paste `index.ts` and `parse.ts`). Turn **Verify JWT** off, because Mailtrap cannot send a Supabase login; the secret key in the URL protects it instead.
3. Edge Functions, Secrets: add `MAILTRAP_API_TOKEN` (account-level token with Inbound access), `MAILTRAP_INBOX_ID`, and `INBOUND_WEBHOOK_KEY` (a long random string, 32+ characters). Never put these in chat, in the repo, or in any `VITE_` variable.
4. Mailtrap, Webhooks, Create New Webhook, Inbound Inboxes: URL `https://<project-ref>.supabase.co/functions/v1/inbound-email?key=<INBOUND_WEBHOOK_KEY>`.
5. GitHub, Settings, Variables: set `VITE_BOOKINGS_INBOX_ADDRESS` to the inbox address so Home shows where to forward.

Limits: Mailtrap's free plan is shared with sending (about 4,000 per month, 150 per day). Supabase free projects pause after a week of inactivity, which also pauses this.


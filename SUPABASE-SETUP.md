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

`src/auth.tsx` authenticates the real account, then `src/prototype.tsx` renders the original app. Demo data is loaded from a per-account browser save or the built-in fixture. Older `trip-planner-v1` saves are copied without changing the original. Account trip details load through `src/account-trips.ts`. Supabase saves trip metadata and the owner membership; itinerary, budget, and fictional group previews still use browser storage. Old local saves are not automatically claimed by email or uploaded.

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

`owner_id` is the owning account; `created_by` retains creator history. Browser clients cannot change either field after creation. The only privileged trip function is a private trigger with a fixed search path and explicit `auth.uid()` checks; it inserts exactly one Owner membership in the same transaction. No client can insert or alter memberships/roles. Future invitations should add accepted Editor/Viewer memberships, then extend RLS for their specific capabilities; they must never replace the owning account. Editable-day permissions should move to a separate membership/day relation if that feature is added.

The UI waits for a confirmed save, retains failed form input, uses the same UUID for creation retries, checks revisions on edits/deletes, and loads account trips independently of browser storage. Events, expenses, preferences, and invitation previews do not sync in this slice.

For opt-in live verification, run the production preview on port 4173 and `npm run test:live-trips`. The script creates two temporary Auth accounts, proves cross-account isolation and fresh-browser persistence, and removes their trips, memberships, profiles, and accounts. It needs the ignored server secret; it never prints credentials.

Security advisor: the CLI could not connect via IPv6, and the documented hosted advisor endpoint returned `403` because the existing scoped token lacks `advisors_read`. No wider token was requested. Live adversarial API tests verified the relevant access controls.

# Supabase setup

Project reference: `mzwydinhvgmwhnwlomnn`.

## Local credentials

| File | Variables | Purpose |
| --- | --- | --- |
| `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser authentication |
| `.env.server.local` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Private administration/testing; never bundled |
| `.env.supabase.local` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | Database management |

These files are ignored by Git. Keep the tracked example files as placeholders. Only the publishable key belongs in a `VITE_` variable. Restart Vite after editing environment files. `npm run supabase:check` checks the three connections without printing credentials or modifying data.

## Working login slice

1. Open the local app and choose **Create an account**.
2. Enter a name, email, and password of at least eight characters.
3. Signup signs you in immediately and opens the demo app. Email confirmation is disabled for this prototype at Dan's request.
4. Sign out, then log back in with the same email and password. Refreshing preserves the Supabase session.

Each signup creates `auth.users` and a corresponding `public.user` profile through the private `create_account_profile` trigger. The profile uses the Auth UUID as `userID`; passwords never enter the public profile. The existing five sample users were preserved as group records and are not login accounts.

`src/auth.tsx` authenticates the real account, then `src/prototype.tsx` renders the original app. Demo data is loaded from a per-account browser save or the built-in fixture. Older `trip-planner-v1` saves are copied without changing the original. No travel-table queries or planner RPCs run; only authentication and account-profile creation use Supabase.

## Schema correction

`supabase/migrations/20261010194129_auth_only_lucid_schema.sql` records the one-time correction applied to this existing project through the Management API on October 10, 2026. It removes the earlier planner implementation, renames the two creator columns to match Lucidchart Page 1, and adds only profile creation and profile-read access. It is not a fresh-project bootstrap and must not be rerun against the already-corrected project. No CLI migration-history baseline has been established.

All original group records were checked by fingerprints before and after the correction. The two unused role records introduced by earlier QA were removed by exact ID. All five public tables retain RLS; only one's own user profile can be read by the browser.

## Later

When email verification is added, configure a custom SMTP provider and the app's exact redirect URLs before enabling Confirm email. Supabase's default SMTP only sends to project-team addresses. No email provider, social login, or password-reset feature is part of this slice.

# Trip Planner prototype

Build the approved responsive travel prototype. Page numbers 1–13 and 15–17 are stable; Page 14 is reserved. Supabase provides real email/password signup, login, and sign-out. Successful authentication opens the planner. Account trip creation, core-detail editing, listing, and deletion use the existing Supabase trip table. Itinerary, budget, and participant controls remain browser-only previews. Supabase project credentials belong only in the ignored local environment files.

## Workflow

User approved direct commits to main and public GitHub Pages hosting on October 1, 2026. Keep intermediate QA artifacts out of the published repository. Build and check desktop/mobile core journeys before deployment. Use typed domain rules for dates, permissions, and money. Supabase stores authentication, profiles, and account trip details. Demo data stays locally separated per account; preserve the older trip-planner-v1 browser save when importing it.

## Corrections & Lessons Learned

- A populated fictional trip must coexist with a genuinely empty new-trip flow for usability testing.
- Calendar maps to Page 11 with date navigation; Page 10 is restricted to active dates.

- Prevent the native default action of non-submit buttons: React can reuse a Next button as a submit button during a form-step update, causing premature submission.

- Validate secondary text and dialogs as well as primary screens; combine automated accessibility checks with visual review.
- Keep a clear return to the tester’s own workspace when entering the sample.
- Long trip names should expand the hero and wrap within layouts rather than cover controls.
- A mobile layout must retain access to account settings even when desktop profile controls are hidden.

- Supabase scope correction (October 10, 2026): Dan already has a Supabase project; prepare this repo to connect to it. Do not create a project, tables, anonymous-auth workspaces, or replace the data model as part of connection preparation.
- The authoritative source is this trip-planner checkout, not the separate Desktop travel-planner-prototype repo.

- Scope expanded at Dan’s explicit request on October 10, 2026: connect app persistence to the existing Supabase project. Use the existing core tables with additive per-account metadata; preserve unassigned group records. Never infer ownership of existing rows from an unverified identity.

- Latest scope correction (October 10, 2026): use Lucidchart Page 1 as the five-table schema. Revert the planner JSON fields, planner_accounts, save/load RPCs, and trip persistence. Only real email/password signup, login, and sign-out are active; keep existing group records intact. Passwords belong in Supabase Auth, never public.user.password.

- Dan clarified that this is a low-fidelity class prototype: keep the login vertical slice simple and add verification later. Email confirmation was explicitly disabled at his request; do not expand scope to email providers or other account features now.

- Post-login correction (October 10, 2026): Dan wants real signup/login to open the existing demo app directly, not a login-success placeholder. Trip screens, sample trips, and browser-saved demo edits must remain available without live trip database reads or writes. The old fictional credentials are not Supabase accounts; use Explore sample trip after real login.

- Login entry options (October 10, 2026): provide one-click local Maya demo access without requiring an account. Keep its browser storage separate from real accounts. Google and Apple login buttons are explicitly prototype previews until Dan requests real provider setup.

- Provider button styling: use the official Google/Apple artwork and approved Sign in with wording. Keep prototype badges outside branded button artwork, and preserve logo proportions and brand colors.

- GitHub Pages publishing correction (October 10, 2026): deploy current source using .github/workflows/pages.yml and Pages source GitHub Actions. Commit source only; generated docs/dist are not authoritative. Tests and the production build must pass before deployment; verify live version.json matches the deployed commit. This replaces the earlier manual main:/docs workflow.
- Demo navigation must not clear the participant as a substitute for signing out. Sample return controls must remain reachable after changing fictional participants, and re-entering the sample must preserve the original return account.

- Use a neutral login greeting (Welcome to Trip Planner); the app does not know whether a signed-out visitor is returning.

- Scope expanded October 28, 2026: Dan requested a working Create trip / Save trip vertical slice tied to the signed-in account. This supersedes earlier auth-only restrictions. Use the existing trip table, database-enforced ownership, confirmed saves, failure recovery, and reload/fresh-browser verification; preserve old group records and local sample data.

- Schema clarification October 28, 2026: the initial schema may be extended as features need. Keep relational constraints, migrations, validation, and RLS. Trips have one owning Auth account (`owner_id`) and separate account memberships/roles (`trip_member` → `role`); create the owner membership atomically. Future collaborators (Editor/Viewer) must not be modeled as additional owners or inferred from client-only participant data.

- Field limits agreed October 28, 2026: use src/limits.ts for text, invitation, and money limits; validate both form inputs and save handlers. Keep the database trip validator aligned with the 100-character title and 220-character destination limits. Show character counts and preserve existing oversized text until the user edits it.

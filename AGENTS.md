# Trip Planner prototype

Build the approved responsive travel prototype. Page numbers 1–13 and 15–17 are stable; Page 14 is reserved. Supabase provides real email/password signup, login, and sign-out. Successful authentication opens the planner. Account trip creation, editing, listing, deletion, and all structured planning details use Supabase. Sample/demo trips remain browser-only. Supabase project credentials belong only in the ignored local environment files.

## Workflow

User approved direct commits to main and public GitHub Pages hosting on October 1, 2026. Keep intermediate QA artifacts out of the published repository. Build and check desktop/mobile core journeys before deployment. Use typed domain rules for dates, permissions, and money. Supabase stores authentication, profiles, and complete account trip details. Demo data and temporary unsaved recovery drafts stay locally separated per account; preserve the older trip-planner-v1 browser save when importing it.

## Corrections & Lessons Learned

- Receipt automation clarification (November 2, 2026): travelers must email receipts to a dedicated Gmail inbox. Model the planned workflow as emailed receipt ingestion, not scanning a traveler's connected personal inbox. The admin portal and automation remain planned.
- Architecture diagram clarification (November 2, 2026): show the receipt sequence as connected visual steps inside the diagram: email receipt, AI extraction, admin review, Supabase save, and customer display. A footer sentence alone is not enough.

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

- Use a neutral login greeting (Welcome to Stir Crazy); the app does not know whether a signed-out visitor is returning.

- Scope expanded October 28, 2026: Dan requested a working Create trip / Save trip vertical slice tied to the signed-in account. This supersedes earlier auth-only restrictions. Use the existing trip table, database-enforced ownership, confirmed saves, failure recovery, and reload/fresh-browser verification; preserve old group records and local sample data.

- Schema clarification October 28, 2026: the initial schema may be extended as features need. Keep relational constraints, migrations, validation, and RLS. Trips have one owning Auth account (`owner_id`) and separate account memberships/roles (`trip_member` → `role`); create the owner membership atomically. Future collaborators (Editor/Viewer) must not be modeled as additional owners or inferred from client-only participant data.

- Field limits agreed October 28, 2026: use src/limits.ts for text, invitation, and money limits; validate both form inputs and save handlers. Keep the database trip validator aligned with the 100-character title and 220-character destination limits. Show character counts and preserve existing oversized text until the user edits it.

- UI copy scope correction (October 28, 2026): Dan wants implementation notes removed only from Budget and Suggestions, including the shared footer on those routes. Restore and preserve notes on all other pages and dialogs. Keep real versus simulated behavior documented in source comments and IMPLEMENTATION_STATUS.md; update that reference when wiring real services.

- Definition-of-done scope (October 28, 2026): Dan explicitly limited this release to the Budget/Suggestions note cleanup and requested responsive QA, live backend regression, Lighthouse Accessibility >=90, README Complete/Not complete requirements, main-branch integration, and public cloud deployment. This is authorization to publish the verified feature; it is not a request to implement unrelated prototype backends.

- Live-site completion correction (October 28, 2026): navigation fixes requested for the hosted app must be deployed and verified on GitHub Pages before reporting completion. Local build and browser checks alone do not update the site Dan is using.

- Field-limit definition-of-done scope (October 28, 2026): Dan clarified “just the task I gave you for this chat.” Verify and publish the field-limit feature through its existing live account-trip path; do not convert local event, budget, preference, reminder, or invitation previews into backend features for this task.
- Persistence scope expanded October 28, 2026: Dan wants all structured trip details database-savable, with robust tests, while avoiding expansion of auto-suggestions. Persist events/attendees, guest travelers/roles/day assignments, preferences, budgets, expenses/shares/repayment markers, reminders, and dismissed suggestions. Keep actual account invitation delivery and simulated OCR/banking separate.
- Application revision conflicts must use `PT409`, not PostgreSQL serialization code `40001`: hosted PostgREST may repeatedly retry the latter. Verify conflicts against the real API, not only mocks.
- Financial participant foreign keys must be deferred for a whole-trip cascade; removing one traveler retains their historical identity and allocations. Test both removal paths.
- Browser previews from other checkouts can invalidate QA: use `PLAYWRIGHT_PORT` for an isolated port when another task has a preview running. Preserve concurrently published UI changes before deployment.

- Trip-persistence definition-of-done scope (October 28, 2026): Dan explicitly requires responsive desktop/mobile pages, end-to-end user/frontend/backend/database behavior, Lighthouse Accessibility >=90, README Complete/Not complete requirements, main-branch integration, and public deployment for this specific persistence task only. Verify the real account-trip states, including save recovery; do not expand recommendations or unrelated integrations.

- Home copy correction (October 28, 2026): hide the idle “All trip changes saved to your account” message on Home only. Keep saving/error recovery feedback and the other pages unchanged.

- Save-feedback correction (October 28, 2026): Dan expanded the request to remove the permanent saved banner everywhere and show a small bottom-right “Changes saved” notification after confirmed account writes. Show no success on initial load or failed/pending saves; retain recovery controls.

- Breadcrumb navigation (October 29, 2026): the top bar must link back to actual parent screens, not display a decorative destination. Derive the trail from the current route, preserve date context for event parents, and keep all levels reachable on tablet and mobile.

- Forwarded bookings (October 29, 2026): Dan approved a free Mailtrap inbound inbox plus a Supabase Edge Function and `forwarded_booking` table so accounts can forward confirmation emails. No custom domain, no AI parsing, no spending. Store extracted fields only. Secrets stay in Supabase and GitHub settings, never in `VITE_` variables or chat.


- Map provider correction (November 6, 2026): Dan wants the existing Google Maps JavaScript API on the Map tab. Preserve the hosted browser-key wiring and verify real Google imagery and interactions on desktop and mobile before publishing map changes.

- Itinerary pin correction (November 6, 2026): opening the Google Map must automatically place unpinned itinerary addresses for owners and viewers, including existing events, without choosing a stop first. Preserve user-adjusted pins.

- November 6 itinerary location correction: accept complete location text without a 220-character cap or counter. Resolve the location during itinerary save and reuse it on the map. A named area should receive a labeled center pin. Keep address entry in the itinerary only.

- November 6 map and field refinement: Map stops open their exact daily itinerary item, including for viewers. Hide routine character counters across the site. Allow 2,048 characters for new or changed itinerary addresses and preserve previously saved longer addresses.

- Use the theme’s paper and ink colors together for the invite email field. Check typed, unselected text in both light and dark mode.

- Use the same destination-neutral travel photos for every trip invitation, regardless of the trip cover or destination.

- Calendar dragging uses the event’s top edge and rounds to the nearest minute. Aligning that edge with the 10 AM line must save 10:00 AM wherever the card was grabbed.

- Account trip changes must save to the live database, resume after interruption and reach other open planner screens. Verify the published site with independent signed-in browser sessions.

- Email invitations must open the normal login and signup options. Preserve the exact trip while the traveler chooses an account, including a different email, then open its preference survey.

- Anchor custom dropdowns to the input itself, leaving only enough space for its focus outline. Destination suggestions should match the text field width and stop before the Add button.

- Group permissions (November 6, 2026): invited accounts start as Viewers. Only the owner can grant Editor or Day Editor access. Check both dates for event moves, enforce grants on database writes, and show a simple permission prompt when an edit is denied.

- Invitation email correction (November 6, 2026): send an invitation email to existing accounts too. The same initial account screen selects login for existing accounts and signup for new invitees; preserve the exact trip through authentication. Remember valid sessions, but never infer account access from a browser-visit cookie.

- Invitation expiry (November 6, 2026): all newly sent trip invitations last seven days. Enforce expiry on the server without expiring accepted trip memberships or extending unrelated password-reset links.

- Sprint audit scope clarification (November 7, 2026): Dan's definition of done applies only to the seven screenshot features: edit account, profile pictures, immediate post-join trip preferences, collaborators sharing the same map pins, invitations, correct map/day itinerary linkage, and readable group preference charts. Do not count unrelated unfinished OCR, banking/payments, nearby alerts, or other prototype integrations against this sprint. Distinguish API-mocked browser checks from live multi-account/inbox/database verification.

- Additional sprint audit scope (November 7, 2026): Dan added editable itinerary pictures and database-backed budget information as two further screenshot features to check against the same definition of done. Audit these independently of unrelated unfinished prototype integrations.

- Saving investigation (November 8, 2026): stay within existing persistence features. Recovery records must be isolated across tabs, discoverable after interruption, and retired only after a safe transfer or confirmed completion. Test two simultaneous unsaved trips, not just one tab's retry. Legacy RPC-created trips can have empty destination timezone arrays; repair these only through the owner's existing save path, preserving collaborator permission checks.

- Reliability review (November 8, 2026): follow `PERSISTENCE_CONTRACT.md` for every persistence change. Use actual Web Lock ownership before adopting another tab's backup, validate all nested recovery data, and report storage failures honestly. Owner trip content/timezones/photo credit belong in one server transaction; do not restore separate credit upserts. Add database round-trip and concurrency checks when extending persisted fields, and distinguish automated mocked CI checks from explicit live-database verification.

- Currency refresh correction (November 10, 2026): Dan wants weekly automatic exchange-rate checks, not hourly. Preserve manual refresh and visible rate dates; focus/reconnect must reuse rates within the seven-day cache period.

- Budget UX correction (November 10, 2026): prioritize balances and the expense ledger; keep currency conversion compact and collapsed at the bottom with a small shortcut, not a dominant card above expenses. Avoid duplicate totals and simulated confirmation popups. Agent persona scores are simulated reviews, never human-user research.

- Budget review continuation (November 11, 2026): Dan requested continuing until the 9.5 panel target is met. Keep independent scores and earlier evidence intact; compare the unrounded panel mean against the target, and distinguish simulated reviewer ratings from human-user evidence. Verify long mobile forms with the complete Save control visible, including after expanding split participants.

- Budget action placement (November 11, 2026): Dan wants Add expense at the top right of the expense log card, rather than the page heading. Keep it within the card on small screens without crowding the tabs.

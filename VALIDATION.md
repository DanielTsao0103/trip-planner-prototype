# Real authentication and local demo validation

Validated October 10, 2026, against the existing Supabase project and local app at `http://127.0.0.1:5190/`.

## Passed

- TypeScript check and Vite production build; all nine tests pass (six domain tests and three local demo storage tests).
- Actual browser signup with name, email, and password signs in immediately with email confirmation disabled.
- Signup creates a matching `public.user` profile using the Auth UUID; its legacy password column stays NULL.
- Browser sign-out, login with the newly created account, session persistence after refresh, and incorrect-password rejection.
- Two-account API checks: profiles are isolated, anonymous profile access is denied, and the password column cannot be read by authenticated clients.
- Travel tables return no rows to app clients; the old planner RPCs are gone.
- The public schema matches the five tables and columns shown in Lucidchart Page 1.
- Original user, trip, event, and membership records match their pre-change fingerprints after normalizing the two creator-column renames. Original roles remain; the two unused QA roles were removed.
- All three initial temporary authentication test accounts and profiles were removed. The subsequent demo-entry browser test account and profile were also removed.
- Built JavaScript contains neither private credential nor the old planner RPC names. Browser-local trip storage is intentionally included.
- Real browser signup opens Home directly; the sample trip opens with its original six plans.
- A sample trip title edit survives browser refresh; the title was restored afterward. Logout from the demo returns to the real login form.
- Local storage tests cover preserving legacy custom trips, matching a legacy demo identity, restoring sample mode and edits, and separating account storage keys.
- Local credential files are ignored by Git; `git diff --check` passes.

## Local trip deletion

- Owners can delete locally created trips from My Trips or Edit trip; built-in samples are preserved.
- Browser-tested creating a disposable trip, opening deletion from My Trips, cancelling with Keep trip, then deleting from Edit trip.
- After refresh, the disposable trip remained deleted and the pre-existing trip was still present.
- The active-trip reference is cleared on deletion; no Supabase trip request is made.
- Production build, all nine existing tests, and whitespace checks pass.

## Login entry options

- Try demo as Maya opens the sample itinerary without a Supabase account; refresh preserves demo mode and Log out returns to the login page.
- The standalone demo uses its own local storage key and never creates an Auth session.
- Google and Apple buttons are explicitly marked Prototype; both were clicked and verified to show a preview message without a provider redirect.
- Production build, all nine tests, and whitespace checks pass.

## Current limits

Supabase handles signup, login, sessions, logout, and the minimal account profile. The existing prototype screens run with fictional trips and browser-local changes; no live trip database is connected. Legacy browser saves are copied when present and left untouched. Email confirmation is intentionally off; email delivery, verification, social login, password reset, and live trip persistence are outside this slice.

The old fictional Maya credentials remain in the sample data but are not a Supabase account. Use Try demo as Maya on the login page, or Open the sample trip after real login, to explore Maya’s itinerary.

The CLI advisor check could not run because this network lacks IPv6; direct RLS and column-access checks above passed. The current app build is copied to `docs/` with `npm run build:pages` for GitHub Pages publishing. Historical screen/journey reports describe that earlier prototype.

## Branded sign-in buttons

- Google button uses the current official multicolor logo, Google Sans Medium, white fill, gray border, and approved Sign in with Google wording.
- Apple uses unmodified artwork from its official button-image endpoint, white logo/text on black.
- Both controls are 44px high with the prototype explanation outside their artwork.
- Desktop and 390px mobile views were visually checked; both preview click responses still work. Production build and whitespace checks pass.

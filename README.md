# Trip Planner

This phase implements one working vertical slice: email/password account creation, login, persistent sign-in, and sign-out through the existing Supabase project. Email confirmation is off for this class prototype, as requested.

After real login, the active entry point opens the original demo app directly. Trip screens, expenses, surveys, and participant controls run on fictional browser-only data. There are no live trip database reads or writes, real invitations, or real travel integrations. Social login remains simulated inside the prototype.

## Run locally

```sh
npm install
npm run dev -- --port 5190
npm run supabase:check
npm test
npm run build
```

The browser needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. The private project key and management token stay in separate ignored files; see [Supabase setup](SUPABASE-SETUP.md).

## Demo trips and old test accounts

Choose **Open the sample trip** on Home to open Maya’s Seattle itinerary. The built-in coast and Chicago trips remain available too. **Prototype** lets you switch fictional participants and return to your own workspace.

The old fictional login was `maya@example.com` / `travel123` (also Eli, Nora, and Sam at `@example.com` with the same demo password). These are fixture identities, not Supabase login credentials. Use **Try demo as Maya** on the login page, or sign in with a real account and open the sample.

Demo changes are stored in this browser under `trip-planner-demo-v1:<account UUID>`. On first use, an existing `trip-planner-v1` save is copied without changing or deleting the original. Returning in the same browser restores your demo edits; other browsers/devices have independent data. This local prototype state is not real trip authorization or shared cloud storage.

## Database

The five existing public tables match [Lucidchart Page 1](https://lucid.app/lucidchart/03d6d88e-7779-4ff9-ab5c-e40edb375353/edit?page=0_0): `user`, `trip`, `event`, `role`, and `trip_member`. The creator columns on `trip` and `event` are named `created_by` as shown in the diagram. All original records were preserved.

Signing up creates a Supabase Auth account and a matching `public.user` record with the same UUID. Supabase Auth handles passwords; the diagram's legacy `password` field remains NULL for new accounts and is not readable from the app. Signed-in users can read only their own profile. Travel tables remain protected by RLS with no browser-access policies.

The earlier planner persistence was removed: no `planner_accounts`, planner metadata fields, save/load RPCs, or cloud trip synchronization.

## Scope and publishing

The source includes real authentication and a local demo mode. The previously published GitHub Pages build in `docs/` has not been replaced; updating repository source does not publish the new app. Prior screen references describe the original prototype.

## Assets

Photographs from [Unsplash](https://unsplash.com/license), bundled for dependable loading. Seattle skyline: `photo-1438401171849-74ac270044ee`; ocean: `photo-1518837695005-2083093ee35b`; city: `photo-1477959858617-67f85cf4f1df`; dining: `photo-1414235077428-338989a2e8c0`; artwork: `photo-1561214115-f2f134cc4912`. Except for the Seattle skyline, photographs serve as travel/venue mood imagery rather than proof of specific locations.

DM Sans and Fraunces are bundled via Fontsource under their open font licenses. Interface icons use Lucide. All names, bookings, participants, costs, and permissions are fictional.

### Login page options

- **Try demo as Maya** opens the fictional sample trips immediately, without an account. Demo mode survives refresh in the same tab; Log out returns to login. Its local saves are separate from real account saves.
- **Sign in with Google / Apple** are labeled prototype previews. They explain that no provider account is connected; real provider authentication is not configured.
- Email/password signup and login continue to use Supabase Auth.

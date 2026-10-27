# Trip Planner

[Live app](https://danieltsao0103.github.io/trip-planner-prototype/) · [GitHub repository](https://github.com/DanielTsao0103/trip-planner-prototype) · [Demo video](https://www.loom.com/share/be0601e7285d4cf5876df31a91e2bba6)

## App Summary

Planning a group trip often means keeping track of messages, calendars, bookings, and shared expenses in different places. Trip Planner is for friends, families, and other groups who want those plans in one place. The app brings together trip dates, destinations, a day-by-day itinerary, group members, preferences, and budget screens. Travelers can explore a fictional Seattle and Bainbridge trip or create a separate trip in the prototype. Our working backend feature is email and password account creation, login, and sign-out through Supabase. Creating an account saves the account and its name in the database, then opens the planner with that person's name. Trip edits, expenses, and group controls currently stay in the browser, so those features demonstrate the planned experience without sharing live trip data between users.

## ERD

![Trip Planner database: five tables, their attributes, and six labeled foreign-key relationships](assignment/team-erd.png)

This is the team's original ERD, corrected in Lucidchart and exported after checking the live Supabase schema on October 10, 2026; see [Lucidchart Page 1](https://lucid.app/lucidchart/03d6d88e-7779-4ff9-ab5c-e40edb375353/edit?page=0_0). The five public tables are:

| Entity | What it stores | Screen connection |
| --- | --- | --- |
| `user` | Name, email, and provider for a person | Signup and account identity |
| `trip` | Creator, name, destination, dates, and time zone | Trip creation and trip list |
| `event` | Creator, trip, title, location, date, times, estimated cost, and notes | Itinerary and Add event |
| `role` | Role name and edit/invite flags | Group permissions |
| `trip_member` | Trip, user, role, editable date, and membership status | Group travelers and assigned days |

A user can create many trips and events. A trip can contain many events and memberships. A user and a role can each appear in many memberships. `trip_member` connects users and trips as a many-to-many relationship. In crow's-foot notation, a circle means zero, a bar means one, and a crow's foot means many. All six foreign keys currently allow NULL, so each child row has zero or one referenced parent; the diagram labels that optionality explicitly. This is the current implemented model, not a claim that all prototype screens have cloud persistence. Expenses, preference answers, and other browser-only features are outside this five-table backend slice.

Supabase also manages `auth.users`. On signup, a private trigger creates a `public.user` profile with the same UUID. Existing fictional group users are not automatically Auth accounts, and there is no foreign-key constraint from `public.user` to `auth.users`. The legacy `user.password` column remains in the team schema but is unused for new accounts; Supabase Auth handles password storage, and the browser cannot read that column.

See [Supabase setup](SUPABASE-SETUP.md) for the existing database configuration and schema history.

## Tech Stack

| Layer | Technology | Why it fits this project |
| --- | --- | --- |
| Frontend | React 19, TypeScript, CSS, and Vite 7 | Preserves the team's existing responsive screens; TypeScript checks data shapes before building. |
| Backend | Supabase Auth and its JavaScript client | Provides account creation, password checking, sessions, and sign-out without a separate custom server. |
| Database | PostgreSQL hosted by Supabase | Stores the five relational tables and Auth accounts; a database trigger creates the matching profile. |
| Hosting | GitHub Pages | Hosts the built frontend at the shared live-app link. Supabase runs the backend separately. |
| Development | Node.js, npm, and GitHub | A committed lockfile gives teammates the same dependencies and source version. |

This approach reuses our existing frontend and lets the team focus on one working backend feature. We can inspect both the code in GitHub and the tables in Supabase. The tradeoff is dependence on Supabase availability and plan limits; teammates should check the project's current usage before expanding it. Node.js runs development and build tools here, not a custom production API server. AI-assisted code generation does not replace the hosted database or backend.

## How to Get It Running

### Open the hosted app

1. Open the [live app](https://danieltsao0103.github.io/trip-planner-prototype/).
2. Use **Create an account** for the working database feature, or log in with an account you previously created.
3. **Try demo as Maya** is an optional local preview. It does not create a database account and is not the assignment's vertical slice.

### Run a fresh copy locally

1. Install Node.js 22.18 or newer with npm. Clone the repository and open a terminal in its project folder.

   ```sh
   git clone https://github.com/DanielTsao0103/trip-planner-prototype.git
   cd trip-planner-prototype
   ```

2. Install the locked dependencies:

   ```sh
   npm ci
   ```

3. Copy the configuration template:

   ```sh
   cp .env.example .env.local
   ```

   In `.env.local`, fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using the existing team project's **Connect** dialog. The team project reference is `mzwydinhvgmwhnwlomnn`. An existing team member can provide the browser configuration if you lack dashboard access. Never put a secret key, service-role key, database password, or management token in a `VITE_` variable. Real environment files are ignored by Git.

4. Check the public connection, then start Vite:

   ```sh
   npm run supabase:check
   npm run dev -- --port 5190
   ```

5. Open [the local app](http://127.0.0.1:5190/). Keep the terminal running; press Control+C to stop. Restart Vite after changing environment variables. If Supabase is not configured, account actions are unavailable, but **Try demo as Maya** still opens the local preview.

6. Run the existing checks when changing code:

   ```sh
   npm test
   npm run build
   ```

The existing hosted database already has the tables, sample rows, and signup trigger. Do not rerun `supabase/migrations/20261010194129_auth_only_lucid_schema.sql`: it records a one-time correction to the team's existing project, not an initial database migration. See [Supabase setup](SUPABASE-SETUP.md) for details. No Python server or SQLite database is used by this version.

## Verifying the Vertical Slice

The chosen action is **Create account**. Logging in to a pre-existing account alone does not clearly demonstrate the new database write; start the demo with signup.

1. Open the live or local app while signed out. Choose **New here? Create an account**.
2. Enter a recognizable test name, an email you control that is not already registered, and a password of at least eight characters. Do not show the password in the recording.
3. Select **Create account**. On the team's current configuration, email confirmation is disabled and the app opens Home with the new account's name. If the project later enables confirmation, complete the email confirmation before logging in.
4. Show the account name on Home. Do not enter Maya's sample or change fictional participants during this proof.
5. Refresh the page and show the same account name and signed-in Home screen.
6. For stronger proof that this is database persistence, sign out and log in with the new account in a separate browser or a private window. The account still works even without the first browser's local trip data.
7. A teammate with Supabase access can confirm the new account in **Authentication > Users**, then check the matching `userID`, `name`, and `email` in the public `user` table. Show only the relevant test row if recording the dashboard.

The request path is:

```text
Create account form
  -> src/auth.tsx calls supabase.auth.signUp with email, password, and name
  -> Supabase Auth writes auth.users
  -> trip_planner_account_created runs private.create_account_profile
  -> the trigger inserts public.user with the same UUID and a NULL password
  -> Supabase returns the user/session
  -> src/main.tsx passes the returned name into the planner
  -> Home displays the account; refresh restores the session
```

The displayed name comes from the returned Auth user metadata. The current frontend does not fetch `public.user` on refresh. Both the Auth record and trigger-created profile are stored in PostgreSQL; signing in from a fresh browser distinguishes that persistence from a local browser save. Supabase's [signup API](https://supabase.com/docs/reference/javascript/auth-signup) and [user-management guide](https://supabase.com/docs/guides/auth/managing-user-data) describe this account/profile pattern.

**Do not use Add event, Try demo as Maya, or the Google/Apple preview buttons as database proof.** Trip changes survive refresh in the same browser through `localStorage`, but do not update the cloud travel tables. Google and Apple authentication are not connected.

### Demo video and submission

[Watch the demo video](https://www.loom.com/share/be0601e7285d4cf5876df31a91e2bba6). Account creation, the returned account name, and refresh demonstrate the backend feature; the recording also shows the new account in Supabase. Its trip and event walkthrough demonstrates browser-local prototype behavior, not additional Supabase writes.

Canvas requires a text entry with the demo video link and the public GitHub repository/README link, one submission per team. The video must be two minutes or less and focus on the vertical slice.

## Google Maps (optional)

The Map page and the Home map card show a real Google map when a Maps key is configured, and fall back to the illustrative demo map when it is not. Places from the trip's events are located with the Geocoding API and shown as numbered pins; the side panel links to walking directions in Google Maps.

1. In Google Cloud Console, create or choose a project, turn on billing, and enable **Maps JavaScript API** and **Geocoding API**.
2. Create an API key. Under **Application restrictions** choose **Websites** and allow `https://danieltsao0103.github.io/*` and `http://127.0.0.1:5190/*`. Under **API restrictions** limit it to those two APIs. A browser key is visible to anyone who opens the site, so these restrictions are what protect it. Set a low daily quota or budget alert.
3. Locally, put it in `.env.local` as `VITE_GOOGLE_MAPS_API_KEY` and restart Vite. For the live site, add the same name as a repository Actions variable and redeploy.

If the key is rejected or the script cannot load, the app switches to the demo map instead of showing a broken page.

## Database and Sample Data

The pre-recording database inspection on October 10, 2026 found 6 `user` rows, 2 `trip` rows, 2 `event` rows, 3 `role` rows, and 5 `trip_member` rows. These are hosted database counts, separate from the fictional fixtures in `src/data.ts`. One public profile matched an Auth account at that inspection; subsequent signups add more accounts and profiles. All five public tables have row-level security enabled; the only public-table browser policy allows a signed-in user to read their own profile. Travel tables have no browser-access policies.

## Project Files

| Path | Purpose |
| --- | --- |
| `src/auth.tsx`, `src/supabase.ts` | Real email/password signup, login, session handling, and Supabase client |
| `src/main.tsx` | Connects the Auth session to the existing planner |
| `src/prototype.tsx`, `src/onboarding.tsx`, `src/planning.tsx` | Planner screens and navigation |
| `src/demo-store.ts`, `src/state.tsx`, `src/data.ts` | Browser-only trip persistence and fictional sample data |
| `src/finance.tsx`, `src/group.tsx`, `src/travelmap.tsx` | Budget, group, and illustrative map screens |
| `src/styles.css` | Responsive interface styling |
| `assignment/team-erd.png` | Team ERD verified against the existing five-table schema |
| `public/screens/` | Historical screenshot gallery; some screens predate real Auth |
| `SUPABASE-SETUP.md` | Existing-project configuration and schema history |

## Publishing

GitHub Actions runs `.github/workflows/pages.yml` on pushes to `main` and pull requests. It installs the locked dependencies, runs the unit tests, builds the site, and runs desktop/mobile browser tests. A passing main-branch build deploys `dist/` to GitHub Pages and checks the live `version.json` against the deployed commit. Set Pages source to **GitHub Actions** and configure repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (and optionally `VITE_GOOGLE_MAPS_API_KEY`, see Google Maps above). Never add private credentials to those variables.

Commit source and assignment documentation; `docs/` and `dist/` are generated and ignored. Keep the README image in `assignment/team-erd.png` so it can be committed. Open app tabs offer **Reload app** when they detect a new release.

For production-browser checks from a Git checkout, use:

```sh
npm run build:pages
npx playwright install chromium
npm run test:e2e
```

For a source archive without Git metadata, set `GITHUB_SHA` to the commit the archive was downloaded from when running `npm run build:pages`. This keeps release metadata tied to the correct source.

The browser suite mocks Auth responses: it tests frontend behavior and session restoration, but does not itself prove a live database write. Separate live Supabase signup, profile, and fresh-client login checks passed on October 10, 2026; the temporary QA account was removed and original records were unchanged. Follow the real-account steps above to verify the backend feature.

## Assets

Travel photos are bundled from Unsplash; [its license](https://unsplash.com/license) applies. Seattle skyline: `photo-1438401171849-74ac270044ee`; ocean: `photo-1518837695005-2083093ee35b`; city: `photo-1477959858617-67f85cf4f1df`; dining: `photo-1414235077428-338989a2e8c0`; artwork: `photo-1561214115-f2f134cc4912`. Other than the skyline, photos are mood imagery rather than verified venue images. DM Sans and Fraunces come from Fontsource; icon artwork uses Lucide. Bundled licenses are in `public/licenses/`, and provider-artwork sources are in `src/assets/auth/SOURCES.md`. Sample travelers, bookings, expenses, and permissions are fictional.

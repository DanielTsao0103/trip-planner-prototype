# Field limits: definition-of-done verification

Verified October 28, 2026 (America/Denver; reports use UTC). Scope is the field-limit task only, as Dan clarified. Local event, budget, preference, reminder, and invitation previews are not converted into backend features by this release.

[Public app](https://danieltsao0103.github.io/trip-planner-prototype/) · [Behavioral requirements](../README.md#field-limits-behavioral-requirements-and-completion-status) · [Machine-readable audit summary](field-limits-qa/summary.json)

## Definition of done

| Requirement | Status | Evidence |
| --- | --- | --- |
| Responsive pages on desktop and mobile | Complete | Visual review at 1365×900 and 390×844; all 22 audited states fit their viewport. Trip, event, and preference forms also passed horizontal-overflow checks at 320, 390, 768, and 1365 pixels. Screenshots below show counters, wrapping, and validation dialogs. |
| User → Frontend → Backend → Database works | Complete | A temporary authenticated user created a maximum-length trip through the public mobile UI. PostgreSQL readback confirmed the title, destination, and atomic owner membership. A fresh browser restored it; editing and reload persisted it. Oversized direct API writes were rejected without modifying the row. |
| Lighthouse Accessibility score ≥90 | Complete | Lighthouse 13.6.0: all 22 desktop/mobile checks scored 96–100. Navigation and interactive snapshot results are distinguished below. |
| README behavioral requirements marked Complete or Not complete | Complete | The README has a scoped field-limit requirements table. Unimplemented backend features outside this task retain Not complete statuses in their separate section. |
| Code integrated into main | Complete | Field-limit implementation 9eb8ea6 is on main. The repository uses Dan's approved direct-to-main workflow; no PR merge is necessary. |
| Changes live at a public cloud URL | Complete | GitHub Pages serves the tested implementation. The deployment workflow verifies version.json, HTML, and the JavaScript asset against the deployed revision. |

Field-limit implementation: `9eb8ea6f7ea0edfa2bdea96c1c8711eff906e30f`. The final Lighthouse audit ran against `2313c721740d4be4493b55f79e6013bad2820079`, verified unchanged before and after the run. Subsequent evidence-only commits do not change application behavior. [Successful app build, tests, deployment, and live-version verification](https://github.com/DanielTsao0103/trip-planner-prototype/actions/runs/40807555486).

## Functional evidence

- The implementation passed 15 unit tests and 30 Playwright desktop/mobile tests, including maximum text length, invalid money, invitation limits, accessible counters, persistence in the local preview, and preservation of existing oversized notes.
- The existing live account-trip regression script passed: authenticated create/read/update/delete, fresh-browser restoration, owner membership creation, account isolation, anonymous access restrictions, and rejected spoofed ownership/membership writes.
- The new targeted live check confirmed a pasted 101-character title and 221-character destination stop at 100/220. Those exact maximum-length values persisted through the UI, Supabase API, and PostgreSQL.
- Direct authenticated API updates with a 101-character title, 221-character destination, or 21 destinations returned PostgreSQL constraint error `23514`; the saved title and revision stayed unchanged.
- The deployed migration `20261029020806_expand_trip_text_limits.sql` aligns the existing database validator with the approved 100/220 limits. The 20-destination count and ownership protections remain enforced.
- Keyboard typing respected the title limit, its count was exposed through the accessible description, and Tab reached the next field. Budget settings opened with Enter, closed with Escape, and restored focus.
- Temporary test sessions were revoked and all test Auth accounts, profiles, trips, and memberships were removed. Existing user records were not altered.

[Live boundary results](field-limits-qa/live-field-limits.json) · [Keyboard and responsive results](field-limits-qa/keyboard-responsive.json)

## Lighthouse results

| Screen/state | Audit mode | Desktop | Mobile |
| --- | --- | ---: | ---: |
| Login | Navigation | 100 | 100 |
| Signup | Snapshot | 100 | 100 |
| Create trip | Snapshot | 100 | 100 |
| Add event | Snapshot | 100 | 100 |
| Preference places | Snapshot | 100 | 100 |
| Additional notes | Snapshot | 100 | 100 |
| Invite traveler | Snapshot | 100 | 100 |
| Budget settings | Snapshot | 100 | 100 |
| Add expense | Snapshot | 100 | 100 |
| Expense validation error | Snapshot | 100 | 100 |
| Reminders / Today | Snapshot | 96 | 96 |

Desktop viewport: 1365×900. Mobile viewport: 390×844. The script explicitly sets and checks the viewport before each audit. Login uses Lighthouse navigation mode; the other states use [Lighthouse snapshot mode](https://github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md) so the currently open form, dialog, or error is audited. These are genuine Lighthouse Accessibility category scores, not axe scores relabeled as Lighthouse.

The remaining reminder-screen finding is insufficient contrast on the existing “Live map” badge. Its score of 96 exceeds the required 90; this feature does not claim a perfect accessibility score or full WCAG certification. Automated results and Codex-operated keyboard/visual checks are not a claim that Dan completed personal manual or screen-reader testing.

## Reviewed screenshots

| State | Desktop | Mobile |
| --- | --- | --- |
| Trip form and character counters | [Desktop](field-limits-qa/desktop-trip-form.png) | [Mobile](field-limits-qa/mobile-trip-form.png) |
| Expense validation and readable error | [Desktop](field-limits-qa/desktop-expense-validation.png) | [Mobile](field-limits-qa/mobile-expense-validation.png) |
| Saved maximum-length trip | — | [Live database result](field-limits-qa/live-database-limits-mobile.png) |

Full-page screenshots may show the fixed mobile navigation partway down the image at its viewport position. The page scrolls normally and the bottom action remains reachable.

## Repeat the checks

Run from the repository root after `npm ci` and installing Playwright Chromium. Live database checks use the existing ignored `.env.local` and `.env.server.local` credentials; do not commit or print those files. The scripts create and remove their own temporary accounts and records.

```sh
npm test
npm run build:pages
npm run test:e2e
mkdir -p /tmp/trip-account-qa
TRIP_QA_URL=https://danieltsao0103.github.io/trip-planner-prototype/ npm run test:live-trips
node scripts/test-live-field-limits.mjs
```

Install Lighthouse outside the application dependency tree, using Node 22.19 or newer:

```sh
npm install --prefix /tmp/trip-dod-tools --no-save --ignore-scripts lighthouse@13.6.0
node scripts/audit-field-limits.mjs
```

The audit writes full HTML/JSON reports and screenshots to `/tmp/trip-field-limits-dod`; only selected final evidence is committed here. It fails if a score is below 90, a page overflows, the audit viewport is wrong, or the deployed revision changes during the run. `QA_TOOLS_ROOT` and the script's URL/output-directory arguments can override its defaults.

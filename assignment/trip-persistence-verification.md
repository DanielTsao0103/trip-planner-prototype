# Full account-trip persistence verification

Date: October 28, 2026 (America/Denver). Scope: persist existing structured trip details, preserve the published UI changes, and test failures. No suggestion-engine expansion.

## Definition of done: this task only

Verified against public application revision `cdff73bf684021ee1e993b47cc973b92c6e7fe2d`. The live revision was unchanged before and after the audit. This follow-up changes verification scripts and documentation only; it does not add new product features.

| Requirement | Status | Evidence |
| --- | --- | --- |
| Responsive, usable desktop and mobile pages | Complete | Visual review at 1365×900 and 390×844; all 42 audited states fit their viewport. Another 32 checks cover eight account-trip routes at 320, 390, 768 and 1365 pixels. Keyboard dialog opening, Escape closing and focus restoration pass on both sizes. |
| User → Frontend → Backend → Database functionality | Complete | The fresh hosted run passed all 90 checks, including full trip detail edits through the UI, direct database readback, fresh-browser restoration, isolation, rollback, conflicts and cleanup. The Lighthouse journey also created and edited real database trips on desktop and mobile. |
| Lighthouse Accessibility score ≥90 | Complete | Lighthouse 13.6.0: 42 checks scored 95–100. The actual authenticated account-trip pages, dialogs and failed-save banner were audited. |
| README behavioral requirements marked Complete / Not complete | Complete | The README now has a dedicated [trip-persistence table](../README.md#trip-persistence-behavioral-requirements-and-completion-status), separate from other tasks. Unimplemented integrations are explicitly outside scope. |
| Code merged into main | Complete | Implementation `cdff73b` is on main using the approved direct-to-main workflow. This evidence and repeatable audit script are committed to the same branch. |
| Live public cloud URL | Complete | [GitHub Pages app](https://danieltsao0103.github.io/trip-planner-prototype/) serves the implementation; the [successful implementation deployment](https://github.com/DanielTsao0103/trip-planner-prototype/actions/runs/40809068497) verified version.json, HTML and JavaScript against the commit. The evidence-only release uses the same Pages verification gate. |

Fresh unit and browser verification passed: **21 unit tests, 36 desktop/mobile tests**, and the production build. All generated functional/audit accounts and associated records were removed. No existing user trip was used as test data.

### Lighthouse results

| Screen or state | Audit mode | Desktop | Mobile |
| --- | --- | ---: | ---: |
| Login | Navigation | 100 | 100 |
| Empty account trip list | Snapshot | 98 | 98 |
| Saved trip list | Snapshot | 100 | 100 |
| Create trip | Snapshot | 100 | 100 |
| Edit trip | Snapshot | 100 | 100 |
| Itinerary | Snapshot | 100 | 100 |
| Day detail | Snapshot | 100 | 100 |
| Event editor | Snapshot | 100 | 100 |
| Food preferences | Snapshot | 100 | 100 |
| Access and interests | Snapshot | 100 | 100 |
| Preference notes | Snapshot | 100 | 100 |
| Group summary | Snapshot | 100 | 95 |
| Add guest traveler | Snapshot | 100 | 100 |
| Guest status | Snapshot | 100 | 100 |
| Role and day settings | Snapshot | 100 | 100 |
| Reminders / Today | Snapshot | 96 | 96 |
| Budget overview | Snapshot | 100 | 100 |
| Budget settings | Snapshot | 100 | 100 |
| Add expense | Snapshot | 100 | 100 |
| Repayment history | Snapshot | 100 | 100 |
| Save failure and recovery | Snapshot | 100 | 100 |

[Machine-readable results](trip-persistence-qa/summary.json) include every score, viewport check, keyboard result and cleanup status. Login uses navigation mode; the authenticated routes/dialogs use Lighthouse snapshot mode to audit the actual open UI without losing account state. These are Lighthouse Accessibility scores, not relabeled axe results. Only generated QA data was used.

The residual findings are an empty-state heading order (98), mobile group touch-target spacing (95), and reminder-page contrast/visible-label naming (96). All scores meet the requested threshold. These automated and Codex-operated checks do not claim perfect accessibility, full WCAG certification, or personal manual testing by Dan.

### Reviewed visual evidence

| State | Desktop | Mobile |
| --- | --- | --- |
| Structured trip/event form | [Event editor](trip-persistence-qa/desktop-event-editor.png) | [Create trip](trip-persistence-qa/mobile-create-trip.png) |
| Failed save and recovery actions | [Recovery banner](trip-persistence-qa/desktop-save-recovery.png) | [Recovery banner](trip-persistence-qa/mobile-save-recovery.png) |
| Individual budget dialog | — | [Budget settings](trip-persistence-qa/mobile-budget-dialog.png) |

Full-page captures place fixed mobile navigation at its viewport position within the long image; the page scrolls normally. Lighthouse can leave keyboard focus on the skip link or close button, which is visible in some screenshots.

### Repeat this verification

Run from the repository root with the existing ignored QA credentials and Playwright Chromium installed:

```sh
npm test
npm run build:pages
PLAYWRIGHT_PORT=4187 npm run test:e2e
TRIP_QA_URL=https://danieltsao0103.github.io/trip-planner-prototype/ npm run test:live-persistence
npm install --prefix /tmp/trip-dod-tools --no-save --ignore-scripts lighthouse@13.6.0
node scripts/audit-trip-persistence.mjs
```

The scoped audit writes full Lighthouse HTML/JSON and screenshots to `/tmp/trip-persistence-dod`; selected final evidence is committed here. It fails below 90, on horizontal overflow or viewport drift, if cleanup fails, or if the deployed revision changes during the run. `QA_TOOLS_ROOT` and the URL/output-directory arguments can override defaults. The app dependency tree is not changed by installing audit tools separately.

## Completed behavior

| Trip data | Database representation | Verified behavior |
| --- | --- | --- |
| Name, destinations, dates, time zone, image URL, group budget | `trip` | Create/edit/read/delete, lengths/dates, revision conflicts |
| Guest travelers, names/emails, roles and status | `trip_member` | Pending/accepted/removed; one owner; guest email never claims an Auth account |
| Editable days and event attendance | `trip_member_day`, `trip_event_attendee` | Same-trip references, date checks, historical identities |
| Events including location, times, cost, notes, image URL | `event` | Add/edit/delete, reload, nonoverlap and date validation |
| Survey answers | `trip_preference` | All fields round-trip, including arrays and accessibility/walking details |
| Individual budgets | `trip_person_budget` | Group/individual mode switching and integer-cent values |
| Expenses, allocations and repayment markers | `trip_expense`, `trip_expense_share` | Odd-cent splits, edits/deletion before settlement, immutable completed allocations, removed guests retain history |
| Reminders | `trip_todo` | Add, complete, delete and reload |
| Existing dismissed suggestion IDs | `trip_dismissed_suggestion` | Round-trip/removal only; recommendation generation unchanged |

## Evidence

- 21 unit tests: domain validation, limits, legacy mapping, and serialized save-queue concurrency/retry behavior.
- 36 desktop/mobile Playwright tests: existing flows plus complete detail editing, lost-response recovery, offline draft restoration, legacy import, deletion and financial-history preservation.
- Production TypeScript/Vite Pages build passed, including the private-credential bundle guard.
- 90 live checks using generated Supabase accounts: full aggregate round-trip, fresh SDK/browser reads, anonymous and other-account isolation, rejected writes roll back, simultaneous revisions, idempotent retries, direct-write restrictions, settled history, cascade cleanup, and the full browser detail journey.
- Original `trip`, `event`, `user`, `role`, and `trip_member` row counts and fingerprints matched the pre-change baseline after QA cleanup, excluding the explicitly added fields/role.
- The original live account-trip regression also passed after the new column grants, including metadata API compatibility and browser deletion.
- Generated test accounts, trips and associated records were removed. No existing user trip was edited for testing.

The automated browser suite mocks API responses; it is separate from the live SDK/browser integration script. Intermediate screenshots/logs and all private test credentials stay outside the repository; the selected final evidence above is public. `scripts/test-trip-persistence.mjs` is opt-in, requires ignored server credentials, and cleans up generated data in `finally`.

## Bugs fixed during verification

1. A whole-trip delete could fail on financial participant foreign keys. Deferred checks now permit complete cascades while preventing orphaned financial rows.
2. A stale revision raised SQLSTATE `40001`, which the hosted API could retry indefinitely. Conflicts now return `PT409`; concurrent-writer tests verify prompt failure.
3. Rapid edits could race or lose newer drafts. Writes now serialize and advance revisions; lost responses retry the original request before newer edits.
4. Old local guest IDs and removed-traveler references could not fit the relational model. One-time imports remap IDs and preserve historical guest records without creating account access.
5. Older metadata-only updates could invalidate dates or leave a stale retry receipt. Root guards and receipt invalidation preserve consistency.
6. Fixed desktop navigation obscured the save banner. The banner now follows the navigation breakpoints and stays visible while scrolling.

7. The itinerary summary ignored individual budget mode. It now uses the same saved personal budget and expense shares as the Budget screen.

8. Removed Day Editors could trap trip dates because their hidden assignments could not be changed. Date edits now ignore inactive permissions while preserving their role and financial history.

## Remaining boundaries

- Actual collaborator account invitations, invitation emails, shared access and collaborative editing are not implemented. Stored guest roles/day assignments prepare the model; they do not grant another account access.
- Receipt/confirmation upload previews and sample extraction are not file storage or OCR. The resulting structured fields save; uploaded file bytes do not. Banking, messages, payments and recommendation feeds remain simulations or future integrations.
- Sample trips stay in local storage. Account trips retain only temporary unsaved recovery drafts locally, removed after successful saving. A conflicting draft requires explicit retry/reload; download is available before discard.
- Account clock initializes from the device on load; demo clock controls remain local. Device location and provider connection previews are not trip records.
- The existing scoped token lacks `advisors_read`; the hosted security advisor was unavailable. RLS, grants and adversarial live API checks were verified directly.
- Migrations are additive applied history for the existing project. They are not a new-project bootstrap; establish a migration baseline before `db push`.

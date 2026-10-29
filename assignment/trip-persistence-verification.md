# Full account-trip persistence verification

Date: October 28, 2026 (America/Denver). Scope: persist existing structured trip details, preserve the published UI changes, and test failures. No suggestion-engine expansion.

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

The automated browser suite mocks API responses; it is separate from the live SDK/browser integration script. Test screenshots/logs and private test credentials stay outside the repository. `scripts/test-trip-persistence.mjs` is opt-in, requires ignored server credentials, and cleans up generated data in `finally`.

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

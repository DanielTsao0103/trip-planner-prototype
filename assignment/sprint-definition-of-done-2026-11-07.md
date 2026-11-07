# Sprint definition of done — November 7, 2026

## Scope

Only the seven items in Dan's two sprint screenshots count toward acceptance: account editing, profile pictures, preferences immediately after joining, shared map pins for collaborators, invitations, map/day itinerary accuracy, and readable group preferences. The earlier whole-application audit is not this sprint's acceptance scope.

Audited public implementation: `5d5eccc1234bdf7a4208e11f750cc87f71df6e22` at [Trip Planner](https://danieltsao0103.github.io/trip-planner-prototype/). This follow-up changed audit tooling and documentation, not application behavior or database schema.

## Acceptance results

| Sprint feature | Status | Verified | Remaining requirement |
| --- | --- | --- | --- |
| Edit account page | Not complete | Live UI name save, independent Auth read, reload; live password change, fresh-client sign-in, original password restored and sign-in reverified. Lighthouse 100 desktop/mobile. | Minor mobile visual polish: a very long email squeezes the Email label into multiple lines. |
| Profile pictures | Complete | Live UI upload, independent profile row and Storage download, reload persistence, removal and cleared profile pointer. Account Lighthouse 100 desktop/mobile. | This verifies the account's own photo; cross-account avatar sharing was not independently rerun. |
| New user sets preferences immediately after joining | Not complete | Invitation/login/signup/survey routing and failure cases pass desktop/mobile API-mocked tests. Live storage and readback of 20 participant preference records passed. Preference page Lighthouse 100. | A real invitation must be accepted into a second account, forced through its survey, saved and independently read back by the owner. This audit did not execute that complete live path. |
| Collaborators see the same trip map and pins | Not complete | Saved coordinates round-tripped in the live database; real Google map displayed the stops. Viewer refresh, edit restrictions and revocation pass API-mocked browser tests. Map Lighthouse 100. | Two independent real accounts must observe the same saved pin updates and access revocation in the hosted app. |
| Invite feature | Not complete | Existing/new-account routing, exact-trip retention, preference gating, invalid links and seven-day receipt cases pass desktop/mobile API-mocked tests. Invitation dialog Lighthouse 100. | Real mailbox delivery and acceptance were not independently retested. Its mobile overlay inherits the Group page's five-pixel document overflow with this 20-person fixture. |
| Map locations link to the correct day/item | Complete | Two known Paris locations on different days round-tripped with their exact coordinates. Live desktop/mobile checks verified the correct event on each day, location button → selected map stop → View itinerary item → the same focused event. Day views and map Lighthouse 100. | This is evidence for the tested locations and date linkage, not a guarantee of geocoder accuracy for every worldwide address. |
| More readable group preferences/charts | Not complete | Live 20-person group, saved answers and response count displayed; 20-person content/labels and charts pass desktop/mobile regressions. Group Lighthouse 96 on both widths. | At 390 px, this fixture produces a 395 px document (five-pixel overflow). Minor chart/layout polish remains. |

“Not complete” means either a reproduced acceptance issue or a specifically unverified live path; it does not mean that all the underlying functionality is absent or broken. No unrelated prototype integrations count against these results.

## Definition-of-done checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| Responsive and visually polished on desktop/mobile | Not complete | Most checked states fit at 1,365 px and 390 px. Two small visual findings above remain. |
| Sprint functionality works User → Frontend → Backend → Database | Not complete | Account/password/photo, live preference storage and dated map paths passed. Live invitation/post-join/two-account verification is still missing. |
| Lighthouse Accessibility at least 90 | Complete | Lighthouse 13.6.0 snapshots: 20 relevant page states, scores 96–100. Includes login/signup, account, populated group charts, invite dialog, preferences, map, event editor and two day views on both devices. |
| README lists behavioral requirements as Complete/Not complete | Complete | This sprint checklist and the feature statuses are linked in README. |
| Implementation is merged into main | Complete | Audited implementation is an ancestor of main; audit tooling/report updates are committed to main. |
| Implementation is publicly deployed | Complete | Version `5d5eccc` was fetched from the public site's version.json. The tested implementation is available without a local server. |

## Database regression and cleanup evidence

- Used only the pre-existing disposable QA account plus randomly generated test trips, events and guest planner records. The 20-person fixture contains one real owner account and 19 fictional guest planner records; it is **not** a two-real-account collaboration test.
- Independently read back all 20 saved preference records and both events' dates/coordinates through the hosted database API.
- An unauthenticated client could not read the QA trip.
- Attempted an invalid coordinate (`latitude = 91`); the database rejected the save. Readback confirmed the revision and saved events remained unchanged, demonstrating rollback rather than a partial write.
- Uploaded an account picture through the UI and independently downloaded its Storage object; removal cleared the profile pointer.
- Changed the QA account password through the UI, verified a fresh sign-in with the new password, restored the original password and verified it again. Restored the original name and empty uploaded-photo state.
- Deleted generated QA trips. Compared all pre-existing trips visible to that QA account before and after: bundles were unchanged. No schema changes or direct writes to unrelated users' records were made.
- This is targeted regression evidence, not a privileged health audit or fingerprint of every row belonging to every user in the project.

## Tests, artifacts and remaining access

**98 relevant desktop/mobile browser tests passed** across account/auth/profile, invitation entry, shared/collaborator maps, map-item navigation and 20-person chart coverage. These tests mock backend responses and are not represented as proof of a live database write. The preceding full suite had 81 unit and 134 browser tests passing.

The [machine-readable summary](sprint-definition-of-done-2026-11-07.json) records exact scores, widths, database checks and cleanup. Raw Lighthouse reports and screenshots remain in the private workspace output directories `sprint-audit-2026-11-07` and `sprint-audit-2026-11-07-final`.

Reproduce with `QA_ACCOUNT_FILE=<private-disposable-account-json> AUDIT_SPRINT=1 node scripts/audit-feature-done.mjs <public-url> <output-dir>`. `AUDIT_READONLY=1` skips account-name/password/photo changes; its isolated fixture and database checks still run. Dependencies and the QA file format are documented at the top of the script and in the earlier audit. Secrets and QA credentials must never be committed.

The existing hosted invitation/permission scripts need the project's private Supabase server configuration to create and remove disposable Auth accounts and generate test proof links. That connection is not present in this checkout. It was requested during this audit; no invitation emails were sent. Real mailbox testing additionally requires a controlled inbox. Until those checks run, the three live collaboration/invitation acceptance paths above remain explicitly unverified.

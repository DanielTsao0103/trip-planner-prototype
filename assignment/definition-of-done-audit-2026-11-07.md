# Definition-of-done audit — November 7, 2026

Scope: the current Trip Planner application, including the account editor, profile pictures, invited-traveler preferences, shared itinerary maps, invitations, destination/location search, calendar and Google Maps popular-times link. This is a verification report, not a claim that every prototype integration is implemented.

## Results

- Audited implementation: `2e46d1e4e4e3b367f9df2492ab752be8dade8636`, served publicly after the normal release workflow passed.
- Unit tests: **81 passed**. Full desktop/mobile browser suite: **134 passed** in [release run 42399618347](https://github.com/DanielTsao0103/trip-planner-prototype/actions/runs/42399618347).
- Lighthouse Accessibility: **96–100** across **36 live states**, 18 each at desktop 1,365 px and mobile 390 px. All 36 document-width checks passed.
- Coverage: login, signup, account, group, invitation dialog, preferences, map, event editor, home, trips, trip form, itinerary list, calendar, suggestions, today, day detail, budget and style. This does not cover every dialog, survey step, theme or possible user data combination.
- The calendar scored 96 and the desktop event editor scored 98; other checked states scored 100. See the [JSON summary](definition-of-done-audit-2026-11-07.json) for remaining automated findings.
- Live name/photo mutations were verified on preceding public revision `11f31bf`; the relevant account components are unchanged in the audited implementation. The original name/photo state was restored and generated QA trips were deleted.
- Overall whole-app definition of done: **Not complete**, due to the end-to-end boundaries below. Existing implemented features must be distinguished from independently reverified behavior.

## Method and evidence

- Read current source, migrations, implementation boundaries and README requirements after fetching main.
- Ran the production build, 81 unit tests and the desktop/mobile browser suite.
- Tested live account-name changes through the UI, checked independent Auth readback and reload, then restored the original name.
- Uploaded a generated test profile picture through the UI, independently downloaded the stored object, confirmed reload persistence, removed it and verified the profile pointer was cleared.
- Created an isolated QA trip containing an actual saved itinerary coordinate for the Eiffel Tower. Inspected the real Google map and its itinerary pin. Deleted the generated trip afterward.
- Ran Lighthouse 13.6.0 accessibility snapshots on authenticated and signed-out live page states. Audit widths are explicitly asserted at 1,365 px desktop and 390 px mobile; snapshots do not navigate away from authenticated forms.
- Inspected screenshots as well as checking document overflow. Automated Lighthouse scoring does not establish complete manual accessibility compliance.

The first audit harness let Lighthouse change its viewport; those runs were discarded as responsive evidence and repeated with explicit Chrome device-metric overrides. Only the final verified run is used below.

## Release regression found and corrected

Two browser scenarios still expected the previous immediate-delete/native-confirm flow. The new event editor opens a Delete event tab with a separate confirmation button. Both checks now follow that real flow. Their desktop/mobile reruns passed. This changed tests only, not event deletion behavior. The failed release had left the live site one implementation revision behind main; normal tested deployment was restarted after fixing the checks.

## Visual finding

The mobile Account page stays within 390 px, but a long account email squeezes the “Email” label until it breaks across several lines. This is a minor visual issue in `.account-facts` rather than horizontal overflow. The strict “responsive and looking good” criterion is therefore marked Not complete pending that polish. No product styling was changed as part of this audit.

## End-to-end boundaries

| Behavior | Status | Evidence and remaining boundary |
| --- | --- | --- |
| Edit account display name and retain it after reload | Complete | Live UI write and independent Auth metadata readback; original QA name restored. |
| Upload, persist and remove an account profile picture | Complete | Live UI, profile row and Storage object readback, reload and removal. |
| Validate account/password forms and hide provider password controls | Complete | Unit and desktop/mobile API-boundary tests. |
| Independently verify a real password change and fresh sign-in in this audit | Not complete | This audit did not change the QA account password. |
| Invitation login/signup routing and mandatory preference survey | Complete | Current desktop/mobile API-boundary tests and source/migration inspection. |
| Reverify invitation delivery through a real mailbox and acceptance into a second account | Not complete | Previously documented as verified in README; not independently repeated in this audit. No invitation emails were sent by this audit. |
| Display saved itinerary coordinates on a real Google map | Complete | Generated live database trip and visible Eiffel Tower pin. |
| Shared map/roles/preferences UI and API contracts | Complete | Current collaborator and shared-map browser tests. |
| Independently reverify shared pins and preference answers from two real signed-in accounts | Not complete | Browser regressions mock these API boundaries. Hosted multi-account scripts require server credentials not available in this checkout. |
| Calendar/event/location save and recovery regression | Complete | Current browser suite; existing real location-save checks documented in this chat. This is not a fresh live write test for every event field. |
| Popular-times link | Complete | Opens Google Maps search for the entered place; no crowd estimate is fabricated or fetched by the app. |
| Real OCR, banking/payments, live nearby/geofence alerts and sourced recommendations | Not complete | Remain fixtures/previews or unimplemented integrations as described in IMPLEMENTATION_STATUS.md. |

Existing hosted invitation and permission scripts are `scripts/test-trip-invites.mjs`, `scripts/test-invitation-routing.mjs` and `scripts/test-group-permissions.mjs`. Their existence is not evidence that they were executed in this audit. The default Playwright suite is API-mocked and is not represented as a real database integration test.

## Reproducing the live page audit

Install `lighthouse@13.6.0` and `puppeteer-core` outside the repository in `/tmp/trip-dod-tools`, or set `QA_TOOLS_ROOT`. Use a disposable QA account without an uploaded profile picture. Supply `QA_ACCOUNT_FILE` as a private JSON file with `url`, `key`, `email`, `password`, and `userId`. Never commit that file.

Run `node scripts/audit-feature-done.mjs <public-site-url> <output-directory>`. Set `AUDIT_READONLY=1` to skip account-name/photo mutations; the script still creates and deletes its own isolated trip and restores account state. Set `AUDIT_CAPTURE_ONLY=1` with `AUDIT_READONLY=1` for a separate screenshot/width pass without Lighthouse scores.

Detailed Lighthouse HTML reports and screenshots are kept outside the public repository. The checked-in summary contains audit results only.

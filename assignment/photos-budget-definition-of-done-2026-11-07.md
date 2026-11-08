# Additional sprint checks: itinerary pictures and budgets

Checked November 7, 2026. Scope is only the two additional screenshot items. Unrelated unfinished integrations do not count against these features.

Audited public implementation: `e556148f4f0def466bf1ba4d6a672a89cf7010f2` at [Trip Planner](https://danieltsao0103.github.io/trip-planner-prototype/). That implementation is on main. Subsequent destination-time-zone changes were preserved when adding this report; the report does not claim to audit that separate feature.

## Behavioral requirements

| Requirement | Status | Evidence |
| --- | --- | --- |
| Choose an itinerary picture from Unsplash | Complete | Live search returned selectable pictures; pointer selection saved the chosen image URL through the event save API. Checked on desktop. |
| Upload and save a custom itinerary picture | Complete | Real desktop/mobile file-input upload, preview and Save changes. Independent `event.image_url` readback matched the chosen upload URL. Public Storage fetch returned HTTP 200. |
| Retain the edited picture on the itinerary after reload | Complete | Reloaded daily itinerary contained the expected image URL on the correct event; screenshot review confirmed the uploaded image rendered. |
| Save a combined group budget in the database | Complete | UI saved $1,000.01; independent `trip` row readback returned `budget_cents = 100001` and `budget_mode = group`. |
| Save an individual budget and the selected tracking mode | Complete | UI switched to individual mode and saved $600.02; independent `trip_person_budget` readback returned `60002` cents for the owner. Bundle readback retained the group amount and individual mode. |
| Save expenses and display saved budget information after reload | Complete | A $12.34 test expense on each device saved as 1234 cents and remained visible after reload. Group and individual amounts remained in bundle readback. |
| Reject invalid budgets without corrupting existing data | Complete | Owner attempted an invalid negative budget through the same save RPC. It was rejected; independent readback showed the entire content and revision unchanged. |

## Definition of done

| Criterion | Status | Evidence |
| --- | --- | --- |
| Responsive and visually checked on desktop/mobile | Complete | All 19 audited states passed document-width checks at 1,365 px desktop and 390 px mobile; screenshots of the saved itinerary picture and budget screens were inspected. |
| User → frontend → backend → database works | Complete | Actual UI uploads/saves, independent database/Storage readback and reload checks above. No mocked backend was used for this audit. |
| Lighthouse Accessibility >=90 | Complete | Lighthouse 13.6.0 snapshots scored **98–100** across 19 states. Budget pages/dialogs scored **100** on both devices. The photo editor scored 98, selected/upload previews 99, and saved itinerary 100. |
| README lists Complete/Not complete behavioral requirements | Complete | This feature table is linked from the README's additional sprint section. |
| Feature code is on main | Complete | Audited implementation `e556148` is an ancestor of main. This report and its reproducible audit updates were committed separately. |
| Feature changes are publicly deployed | Complete | The public site's version.json identified `e556148` when the live checks ran. The app requires no local development server. |

## Database safety and cleanup

The audit created only an isolated QA-owned trip/event and its two image uploads. The UI saved budget and expense data into that trip. No application code, policies, schema or migration was changed by this audit.

After testing, the generated trip's Storage folder was listed, its test uploads removed, and an empty listing confirmed. The generated trip was deleted. Pre-existing trip bundles visible to the QA account were compared before/after and were unchanged. No writes targeted unrelated users' trips. This is targeted regression evidence, not a privileged health scan of the entire database.

A first audit attempt read the individual-budget row before the asynchronous save finished. The audit was corrected to poll for confirmed persistence. The final run completed all desktop/mobile checks and cleanup; the app did not need a product fix for that timing issue.

## Evidence and reproduction

[Machine-readable results](photos-budget-definition-of-done-2026-11-07.json) contain the tested public revision, exact scores, viewport widths, database checks and cleanup result. Raw Lighthouse HTML and screenshots remain in the private workspace output directory `photos-budget-audit-2026-11-07-final`.

Use the existing private disposable-account file format documented in the audit script. Run:

```sh
QA_ACCOUNT_FILE=<private-qa-account.json> AUDIT_PHOTOS_BUDGET=1 AUDIT_READONLY=1 node scripts/audit-feature-done.mjs <public-url> <output-dir>
```

The readonly flag skips unrelated account-name/password/profile-photo changes; this mode still creates its own test trip, uploads itinerary pictures, writes budgets/expenses and deletes its generated data. Never commit the private QA account file.

Limitations: the audit does not test every worldwide photo query, provider outage, collaborator permission combination or historical financial edge case. Lighthouse is an automated accessibility check, not a manual accessibility certification. Existing financial browser regressions cover broader mocked split/repayment and recovery behavior; they are not substituted for the live checks recorded here.

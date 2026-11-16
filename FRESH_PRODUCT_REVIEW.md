# Fresh product review — November 16, 2026

## Baseline and release rule

Start from GitHub main `7af67a3`, pulled before inspection. Fetch and integrate new main changes before every fresh run/build and immediately before publishing. Preserve the existing brand, themes, customer data and permissions. Review current behavior independently of previous scores.

## Plan

1. Inventory every route and complete customer task. Independently review UX, visual design/copy, and reliability using fresh reviewers.
2. Remove routine implementation commentary and false affordances. Keep concise actionable feedback when users need to correct a failed or unsaved action.
3. Fix demonstrated usability and vertical-flow defects, including empty data, long content, denied permissions, stale data, service failures, keyboard access, small screens and orientation changes.
4. Re-review changed areas with the same rubrics and record the actual scores. Target 9.7 per area in UI and UX; neither averages nor test counts substitute for a lower result.
5. Verify full browser/unit/build gates and live account saving, isolation and permission contracts with disposable fixtures. Keep provider fixtures distinct from live services.
6. Integrate any incoming main changes, validate the final revision, publish through the existing gated Pages workflow and verify public customer flows.

## Rubrics

UX: clarity25%, task completion30%, recovery20%, interaction efficiency15%, accessible navigation10%.
UI: hierarchy25%, readability25%, responsive behavior25%, consistency15%, polish10%.
Independent agent reviews are simulated assessments, not human customer research. No zero-bug guarantee.

## Coverage

Account entry/profile; Home/trips/create/edit; preplanned trips; Calendar/Map & list/event editor; Today; Suggestions/Nearby; Maps; Budget/expenses/receipts/repayments; Group/invitations/roles/preferences; Style; currency conversion; integrations; Admin and trackers; shared navigation/dialogs/recovery.

Findings, before/after evidence, remaining limits and release results will be recorded during implementation. Intermediate QA artifacts live outside the published repository.

## Implemented findings

- Active-trip saves failed because the budget-cadence hook referenced a nonexistent column. The deployed hook now uses `amount_cents`.
- Forwarded messages could be assigned using forged sender addresses and older messages could be starved. Ownership now requires a private account subject code, provider IDs may be opaque, and processing follows bounded cursor pages. The three-file handler was deployed through the signed-in Supabase dashboard after the scoped token rejected function writes.
- Booking imports could be marked added before itinerary persistence succeeded. Imports now wait for confirmation and reuse stable event IDs; server marker RPCs check booking ownership, trip access, and the actual event under the trip lock. Retry works after a Viewer downgrade, and older waiting bookings are reachable through pagination.
- Rapid Start-to-End date entry could append text after an asynchronous display update. Date formatting now settles before the next interaction and does not replace a focused draft.
- Catalog text, length and budget filters combine, restore after navigation and offer a useful empty state. Creation cancellation returns to the originating catalog. Tablet cards use adequate width and the search field has one focus indicator.
- Today keeps complete transport labels at 320px and reduces landscape header height. Nearby offers the next available day explicitly. Account Suggestions emphasizes real saved places and Nearby; simulated extraction is confined to explicit sample trips.
- Routine storage and implementation commentary is removed while actionable failure recovery remains. Sample trips are identified on their cards. Ivy trend changes exclude estimated baseline rows; secondary labels retain sufficient contrast.

## Verification

- 240 unit checks passed. Production TypeScript/Vite/Pages artifact builds passed.
- 93 real persistence, validation, rollback, isolation, concurrency, browser editing and cascade checks passed. All disposable records were removed.
- 42 real save-contract checks, 7 active-trip permission/save checks, 19 repayment checks, and 19 booking ownership/import checks passed.
- Real style save/readback, isolation, reload and fresh phone session passed.
- Booking ingestion tests used real Supabase accounts/data and synthetic Mailtrap responses. No test email was sent and the real inbox was not read. Deployed unauthenticated GET/POST returned 405/401.
- Real public Google map tiles and pins rendered on desktop and phone with no console errors. Local SDK fixtures separately exercise failure states.
- Responsive screenshots covered 320, 768 and 1440px catalog widths without page overflow; Today checks include 320px and short landscape.
- All 24 audited desktop/mobile states passed selected WCAG A/AA axe checks after the Ivy text-contrast correction, with no page overflow. Ten booking recovery/pagination browser cases passed.
- Final frozen-build browser gate: 812 passed, 8 device-conditional skips, 0 failures (desktop Chromium, phone Chromium, and selected Safari-engine persistence flows).

## Independent review and limits

Fresh UX and design reviewers used the original fixed rubrics. The catalog's reviewed UX flow scored 9.705. Other reviewed areas remain roughly 9.3–9.6; the final visual sample scored 9.41 after the specific refinements. These are simulated assessments, not a claim that every page achieved 9.7.

Remaining product costs include overnight events needing separate daily entries, a long trip form on phones, and route estimates depending on the educational provider allowance. Nearby food ideas still require choosing a venue. Real email delivery was not exercised. Offset-based booking pagination can require Refresh after another session deletes records; legacy booking imports cannot be retroactively identified by the new stable IDs. The project-wide security advisor is unavailable under the scoped API token.

The fixes materially improve verified flows, but this report does not certify zero bugs or unrestricted production-service readiness.

## Release

Integrated GitHub main `9047c67` and rechecked freshness before each release build. The final candidate passed 240 unit and 812 browser checks. The three additive SQL migrations are applied to the configured project, and `inbound-email` is deployed with unchanged webhook-key authentication. GitHub Pages publication uses the existing four-shard test gate; final public revision verification is recorded outside the repository to avoid a documentation-only deployment loop.

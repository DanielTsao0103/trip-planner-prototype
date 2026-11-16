# Suggestions and receipt verification — November 16, 2026

## Shipped behavior

Account Suggestions and Nearby share the same place search and location selection. The existing Google demo/no-payment key supplies name, formatted address, coordinates, place ID, website and published weekly hours. No paid-key fallback is used. Hours are converted from the venue timezone into the trip clock; a known closed window cannot be added directly. Unknown hours require review and are not invented.

If Google is unavailable, three bounded parallel Tavily searches feed a compact Groq response. Named meal venues replace dish-only suggestions. Source quotes are checked, but a quoted address is not treated as verified identity: the traveler must select an actual place before adding. Model coordinates and place IDs are discarded. An exact two-minute server cache rechecks authentication, membership and authoritative trip revision before reuse.

Budget offers native phone capture, desktop webcam capture and image upload. A real browser OCR worker extracts editable line items and totals. Deterministic integer-cent reconciliation checks arithmetic; OCR itself is fallible. The traveler must review the receipt and confirm the USD expense amount. Foreign or unknown currency is not silently relabeled USD. Capture stops media tracks when closed, captured or unmounted. Private receipt photos and reviewed details survive account reloads without entering shared trip payloads.

Saving uses a stable expense identity. A lost upload response is recovered by reading and comparing the saved photo; failed attachment writes can be retried without duplicate expenses. Existing photo access permissions were retained. The private details table uses payer and accepted-membership checks. Its additive migrations and both Edge Functions were deployed to the existing project. A deferred database trigger preserves metadata across aggregate expense replacement and removes it only after a real expense deletion; photo cleanup follows confirmed deletion with an explicit retry on failure.

## Verification evidence

- Full unit suite, typecheck and production build run before publication.
- Full desktop, phone Chromium and selected Safari-engine regression suite covers existing website workflows. The original manual-receipt test asserted that camera controls did not exist; that obsolete expectation was updated while retaining manual save/reload checks.
- Shared Nearby: 48 browser journeys cover location/date changes, roles, complete location handoff, stale responses, photo delays, hours and saved-place behavior.
- Real Google -> real account -> Add -> independent database read -> fresh signed-in phone session: 10 checks passed. Provider, authentication and persistence were not mocked. The browser's Seattle geolocation was controlled for reproducibility.
- Real Chromium virtual camera -> actual video/canvas capture -> real Tesseract OCR -> real disposable account save -> independent photo/details/expense/share reads -> fresh phone-sized session passed 27 checks, including confirmed deletion and failed-photo-cleanup retry. Lost upload response, failed details write and retry were deliberately exercised. Test data cleanup was verified.
- Separate live receipt storage checks passed 12 assertions, including unauthorized reads/writes and survival across the normal aggregate trip writer.
- Four generated OCR image cases, including an angled image, extracted expected line items and totals. Eight real HEIC/WebKit/Chromium checks covered conversion, OCR, save/reload, a blocked Save during conversion and unsupported-format recovery. Safari sample storage uses bytes because its Blob/File IndexedDB writes failed in the actual test. Generated examples are not proof of universal receipt recognition.
- GitHub Actions now runs the portable virtual-camera/OCR acceptance on its Linux cloud runner and retains screenshots, video, traces and JSON results. Deployment depends on that job and all four browser shards.

The durable scripts are `scripts/test-receipt-camera.mjs`, `scripts/test-live-receipts.mjs` and `scripts/test-live-suggestions.mjs`. Live scripts create disposable no-email QA accounts and verify cleanup. Set `TRIP_QA_URL` to the published site for release verification; `TRIP_QA_LIVE_RECEIPTS=1` enables real account receipt persistence, and `TRIP_QA_CURRENT_LOCATION=1` selects the controlled current-location suggestion scenario.

## Measured latency and limits

Actual Google UI searches took about 0.81–0.83 seconds in the measured successful cases. One real Google Text Search returned HTTP 429, and its web fallback had no usable evidence; the separate Nearby endpoint succeeded. Provider quotas and availability remain real limitations, not passing tests.

A cold web activity request returned three source-backed venue candidates in 4.0 seconds, with a 0.36-second exact cached repeat. A meal request took 2.44 seconds, with a 0.27-second cached repeat. These observations do not establish a latency guarantee. Web addresses still require place confirmation, including when a source itself has an incorrect address.

Physical phone cameras and the operating system's native camera picker have not been exercised by an actual device. Browser virtual-camera tests cover the real web capture APIs; phone-sized contexts cover layout and saved-data reload. The optional allowlisted cloud vision pilot is not claimed as live-tested; the general receipt path uses tested browser OCR. Weekly opening hours do not establish holiday hours, bookings, accessibility, dietary safety, travel time or live crowd levels. Google Popular Times remains a separate provider-owned display where available.

Supabase's scoped token cannot run the security-advisor API. Direct RLS isolation tests passed; this is not a claim of a clean advisor audit. No test suite proves absence of all bugs.

Detailed local evidence is retained under `outputs/suggestions-receipts-2026-11-16` in the shared project workspace. Final release SHA, test counts and published-site verification are recorded there in `RELEASE.md` after deployment.

Implementation references: [PostgreSQL deferred constraint triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html), [Tesseract.js](https://github.com/naptha/tesseract.js), [Google Places search](https://developers.google.com/maps/documentation/places/web-service/text-search).

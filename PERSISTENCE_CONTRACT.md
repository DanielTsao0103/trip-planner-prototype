# Persistence contract

This is the boundary every existing or future account-trip feature must use. Sample trips stay local. A successful screen interaction is not evidence that a database write succeeded.

## One write path

Screens call `mutate`, `updateTrip`, or `saveTrip` in `state.tsx`. The shared `TripSaveQueue` journals the exact pending write and serializes subsequent edits. Owners call `save_account_trip`; collaborators call `save_shared_trip_changes`. Do not introduce direct table writes or a second save queue from a new screen.

The owner transaction validates fields and permissions, checks the expected revision, normalizes legacy destination timezones by destination identity, and writes trip content, ordered timezones, and photo credit together. Every persisted component participates in retry identity. The same request can be retried after a lost response without duplicating the save. Another writer's newer revision produces a conflict instead of being overwritten.

The read-only trip bundle uses a stable database snapshot for its root, child records, and photo metadata. The client accepts a save only when the server returns a complete version-1 bundle for the expected trip, a valid revision, and the requested photo metadata. It never fills in missing save-response data with an empty legacy trip.

## Recovery ownership and failure behavior

- Each tab holds a browser Web Lock for its writer identity. Another tab may recover its journal only after that lock becomes available; elapsed time is not evidence that a tab is dead.
- Recovery records are immutable snapshots. A replacement is stored before its predecessor is removed. Separate accounts and trips have separate keys.
- Recovery input is untrusted. Complete nested shapes, retry generation, account membership, and matching trip identity are validated before entering application state. Invalid or unsupported copies remain untouched and downloadable.
- A failed storage write produces a visible warning and an unsaved download. Never claim a recovery copy exists when persistence failed. Network retries may still succeed while the page remains open.
- Multiple competing drafts are not automatically merged. Server revision checks prevent an older draft from overwriting newer work; the existing download/retry/discard controls remain available.
- Browsers without Web Locks cannot safely adopt another tab's journal. Show the recovery-unavailable warning and retain records rather than guess at ownership.

Web Storage does not supply cross-tab locking ([HTML storage specification](https://html.spec.whatwg.org/multipage/webstorage.html)); the [Web Locks specification](https://www.w3.org/TR/web-locks/) describes coordinating document persistence across tabs. These APIs do not guarantee survival if the user clears browser storage or the device loses all stored data.

## Adding a persisted field

1. Extend the domain type and the exhaustive schema in `trip-recovery-validation.ts`. TypeScript requires a deliberate validation rule for every new Trip, Event, Member, Expense, Preference, reminder, map-point, or photo-credit field.
2. Add the database representation, read mapping, supported-field validation, and permission rules in a migration. Unsupported fields are rejected rather than silently dropped.
3. Extend the live contract fixture to write a meaningful nondefault value, then verify save response and fresh readback. Include owner and applicable collaborator roles, old payload compatibility, exact retry, and stale-revision rejection.
4. Keep the existing queue, complete-response validation, and recovery controls. Changes to metadata must be part of the same transaction or an explicitly revision-checked operation.
5. Run the checks below before publishing. Include migration deployment in the release; a client/database version mismatch must remain a visible failure with recoverable edits.

## Release checks

```sh
npm test
npm run build:pages
npx playwright install chromium webkit
npm run test:e2e
npm run test:live-contract
npm run test:live-persistence
npm run test:live-repayments
```

`npm test` discovers every `src/*.test.ts` file and the inbound parser tests. GitHub Pages deployment is gated on unit tests, strict TypeScript compilation, production build, desktop/mobile Chromium tests, and the persistence suite using WebKit. The live revision verifier checks the deployed HTML and JavaScript against the exact commit.

The live contract/persistence suites use disposable accounts against the configured Supabase project and clean them up. They require ignored local QA credentials and are currently run explicitly before persistence releases; they are not part of GitHub Actions because the repository does not have a privileged database test secret. API-mocked browser tests are not a substitute for these checks. Supabase also documents [database testing](https://supabase.com/docs/guides/database/testing) as a separate verification layer.

## Known limits

- Concurrent whole-trip edits can conflict even when they touch different events. This is an intentional integrity boundary, not automatic collaborative merging.
- Browser storage can be denied, filled, or cleared. Recovery warnings and downloads are necessary; offline data is not a cloud backup.
- Tabs running a pre-lock release cannot advertise ownership. Reload all old app tabs after this upgrade. Old separate photo-credit writes are denied rather than allowed to corrupt another save.
- Tests reduce future regression risk; they cannot promise that an arbitrary future feature will never break saving. New persistence features must update this contract and its tests.

## Audited repayment corrections

`Expense.repaymentHistory` is optional for legacy expenses. New entries preserve their UUID, debtor, status, reason and payer identity; the server supplies the authenticated account and timestamp. Earlier entries are immutable. Corrections append an unpaid entry with a reason; a later paid entry can settle it again. Queued payloads may omit timestamps that the server has not yet returned, but cannot rewrite authoritative history.

Ever-paid `settled` markers remain permanent and lock the original expense, including source, amount, shares and payer. A correction changes repayment status, not the original expense or recorded spending. Both owner and collaborator writes use the existing revision-checked transaction, and a later validation failure rolls back any history append. The audit table permits reads only to the current owner and accepted account members; direct client writes are denied. The two November 12 migrations implement the audit and its narrowly scoped read policy.

## Saved places

`Trip.savedPlaces` participates in the same root revision, retry payload, recovery journal, and atomic transaction as scheduled events. It carries no assigned date, so only Owner/Editor grants may change it. An omitted field preserves the current collection for older clients; an explicit empty array clears it. Saving an idea into the itinerary removes it and appends the event in one update. The client verifies returned place content without depending on JSONB object key order. Live fixtures cover application-writer roundtrip/retry, malformed content rollback, old-client compatibility, and collaborator denial.

Cached-client compatibility: trip bundles expose `savedPlaces` only when the normal `X-Client-Info` header advertises `stir-crazy/saved-places-v1`. The current browser client opts in; existing cached clients retain their supported response shape and preserve the newer collection when saving other fields. This changes serialization only, never authorization. The live contract gate was also run with the actual previously shipped `731da4c` application writer.

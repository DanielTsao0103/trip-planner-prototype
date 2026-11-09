# Verification of the five Done-column cards — November 8, 2026

Scope is exactly the five cards in the latest screenshot. Unrelated prototype work is excluded. “Not complete” below means the definition-of-done verification is unfinished; it is not a claim that the implementation is absent or that a reproducible product failure was found.

| Card | Acceptance status | Current evidence / remaining check |
| --- | --- | --- |
| Be able to invite someone to group | Not complete | Login/signup and invitation routing, invalid-link and retry cases pass desktop/mobile API-boundary tests. Live invitation RPC exists and denies anonymous calls. Real mailbox delivery, acceptance and correct-trip access still need a controlled inbox and separate real account. |
| Editable pictures in the itinerary page | Complete | Fresh live Unsplash selection, custom uploads, event image URL/Storage readback and reload checks passed. Custom uploads were checked on desktop/mobile. Relevant Lighthouse scores: 98–100; width checks passed. |
| All collaborators can add preferences and save to the database | Not complete | Desktop/mobile survey gating and the collaborator-specific save API contract pass. The live preference RPC exists and denies anonymous calls. Previous live owner-side storage of 20 preference records passed. A second real accepted collaborator still needs to save its own answers and have the owner independently read them; another member's answers must remain protected. |
| Connect budget information to database | Complete | Fresh live desktop/mobile saves of group budget, individual budget, mode and expenses passed relational/bundle readback and reload. Invalid negative budget writes were rejected without changing saved content/revision. Budget Lighthouse scores: 100; width checks passed. |
| Make group permissions work | Not complete | Owner/Day Editor UI flow, allowed-day moves, denied moves and viewer behavior pass browser regressions; role/day checks are present in the database save function. The live shared-write RPC denies anonymous calls. Need separate real Owner, Viewer, Editor/Day Editor sessions to verify database-enforced grants, blocked writes, both dates on moves, and revocation. |

## Verification performed now

- Synced and built latest main, `0f43ab4fbbc126ca55a8bd7f2d52744a94901bad`. The public site's version.json matched that revision.
- **83 unit tests passed.** **60 focused desktop/mobile browser tests passed**: invitation entry, Day Editor restrictions, collaborator map access, detailed trip/budget persistence/recovery and collaborator survey submission. These browser tests mock API responses or use the local demo; they are not represented as live multi-account proof.
- Repeated the live itinerary-photo and budget audit against the current public implementation with an isolated disposable QA trip. **19 Lighthouse 13.6.0 snapshots scored 98–100**, and all tested widths passed at desktop 1,365 px and mobile 390 px. Budget page/dialog states scored 100.
- An initial fixture used the legacy trip-creation RPC and omitted the newer destination-time-zone records, causing its UI saves to be rejected. The fixture was corrected to use `save_trip_bundle_with_timezones`. The final run passed. That fixture error is not counted as a photo or budget product failure.
- Confirmed `share_trip_recipient`, `save_invited_preferences`, and `save_shared_trip_changes` are deployed and return HTTP 401 / PostgreSQL `42501` to anonymous callers. This proves an anonymous guard, not every authenticated role's authorization behavior.
- Removed generated uploaded files and trips. Cleanup confirmed empty test-image storage folders and unchanged pre-existing trip bundles visible to the QA account. No application code, database schema or policies were changed by this verification.

[Machine-readable evidence](done-cards-verification-2026-11-08.json) records exact revision, scores, widths, checks and cleanup. Raw reports/screenshots are in the private workspace output directory `done-cards-verified-2026-11-08`.

## Definition-of-done conclusion

The photo and budget cards have current live database, responsive, Lighthouse, README and main/cloud evidence. Those two can be marked verified Complete for the checked scope.

The invitation, collaborator-preference and permission cards are implemented and pass the focused browser regressions, but cannot yet be certified against the full end-to-end requirement. A controlled test inbox plus separate disposable account sessions, or the project's private server configuration for safely generating/cleaning QA accounts and proof links, is needed to close those checks. No invitation emails were sent in this verification.

# Third independent redesign round

Scope: simplify complete organizer/traveler tasks, improve responsive layouts and support overnight scheduled events. Suggestions research and receipt capture were explicitly moved to a separate user-owned chat on November 16. This report does not certify that separate release.

## Product changes

- Home offers one clear creation action in an empty workspace. Creation opens the new calendar; empty trips lead with Add your first plan and Find things to do.
- Invitations, event end day, photos, and detailed group charts remain available as secondary controls. Untouched starter trips cancel without a false discard warning.
- The catalog initially shows twelve trips, searches the full collection, and preserves filters through preview/cancel.
- Group exposes shared food/access needs before a searchable roster. Six travelers show initially, with explicit access to everyone and unchanged permission/removal controls.
- Location entry precedes optional search-area configuration. Context names the actual place, results leave configuration reachable, and touch selection preserves focus and exact place metadata.
- Calendar fits actual available space, shows real day columns on phones and several in landscape, starts near the first visible day's event, preserves rotation/selection, and keeps event actions reachable in short windows.
- Map/list arrival reserves the actual sticky-toolbar height. Calendar focus restoration also reserves its internal day-header height.
- Short permission and Move dialogs retain title/actions while fields scroll. Enlarged headers wrap without overlapping controls.
- Today puts reminders before optional return travel, avoids repeated empty transport labels, and stops suggesting immediate refresh after a known daily estimate limit. External directions remain available.
- Style has a compact live preview, optional full preview, and a complete breadcrumb. Account identifies trip-specific preferences; Admin describes each tracker's metric.
- Overnight events keep one identity and cost while appearing on every occupied day. The database checks every occupied-day grant and protects legacy writes. Exact-midnight endpoints do not occupy the following day.
- Routine storage commentary was simplified to task language; genuine unsaved-work warnings, recovery actions and explicit sample labels remain.

## Evidence

| Layer | Observed result |
|---|---|
| TypeScript and production build | Passed |
| Unit rules | 251 passed |
| Full local browser matrix | 850 passed, 8 intentional project/interaction skips |
| Final focus/short-window regressions after the full matrix | 72 passed, 4 intentional project/interaction skips |
| Live save contract | 56 checks passed; disposable accounts/trips removed |
| Live persistence and browser journey | 93 checks passed; disposable accounts/trips removed |
| Live active owner/editor/viewer journey | 7 checks passed |
| Live repayment journey | 19 checks passed |
| Independent visual review | 234 final principal/supplementary captures, 320/390/768/1440 widths, both appearances, CSS enlargement; no measured horizontal document overflow |
| Independent simulated traveler challenge | Creation, overnight save/reload, map-to-edit recovery, budget validation, permission denial/correction, group constraints, landscape dialogs |

The overnight migration was dry-run in a rolled-back transaction, independently reviewed, applied, and verified through real API writes/readback. Security advisors were unavailable to the scoped token (403); passing the contract checks is not a blanket security certification.

Source evidence and intermediate failure records are outside the published repository under `outputs/reimagine-round-three`. Browser provider fixtures, live database tests, and actual provider responses are distinct evidence. All source/runtime changes must pass the hosted deployment gate and exact-revision verification before a published result is reported.

## Review interpretation and remaining limits

The requested target is 9.7. Reviewers used the unchanged UI weights (hierarchy 25%, readability 25%, responsive behavior 25%, consistency 15%, polish 10%) and UX weights (clarity 25%, completion 30%, recovery 20%, efficiency 15%, navigation 10%). They are simulated reviewers, not recruited humans. Untested dimensions are ungraded. A no-observed-defect rubric tally is not proof of optimal design, a universal 9.7 score, or zero bugs.

The designer's concrete remaining finding concerns the separate Suggestions work: an empty saved collection and metadata precede useful discovery on the phone. This must be reassessed after that chat's release. Actual Today route estimates worked in one review and reached the provider's daily allowance in another; external directions worked, but uninterrupted in-app estimates are not certified. No billing or paid-provider fallback was introduced.

Release state: source verified locally; hosted deployment and overnight Nearby compatibility deployment are still pending at the time this report was written.

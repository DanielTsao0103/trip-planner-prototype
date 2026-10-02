# Five-round QA and UX refinement

Completed October 1, 2026. Each round inspected the current app, made concrete improvements, and checked the result before moving on. Both the fictional Seattle trip and independent new-trip creation remain available.

## 1. First visit and onboarding — passed

**Finding:** Mobile visitors had to work through the login screen before discovering the sample and new-trip choices. Demo-password behavior and optional connection permissions were easy to misunderstand.

**Refinement:** Prominent “Start a new trip” and “Explore the sample trip” choices appear before sign-in. New-trip setup focuses the fictional-name field. Password reveal and explicit return-login guidance clarify the demo. Connection permissions say “Optional,” and the misleading setup-step counter is removed.

**Verification:** At 390px and 1440px, both entry choices fit in the first viewport. Signup, reveal/hide password, skip-connections confirmation, and entry into trip creation passed.

## 2. Create a trip and take the next step — passed

**Finding:** Trip setup lacked a review summary, allowed duplicate destinations and whitespace-only titles, and gave little direction for an empty itinerary. The first summary implementation was hidden with the mobile sidebar; that was caught and corrected within this round.

**Refinement:** Live desktop preview and compact mobile review; readable time-zone names; end date initially follows the start date; duplicate destinations are ignored; blank titles get actionable feedback. Creation confirms success. Empty itineraries guide travelers toward their first plan, budget, and preferences. New trips use generic coastal imagery rather than presenting Seattle as their destination.

**Verification:** Both viewport journeys covered date changes, case-insensitive destination deduplication, validation, preview content, creation feedback, and first-plan entry. The original sample retained all six events.

## 3. Accessibility and keyboard use — passed

**Finding:** Secondary text and navigation labels were too faint. The interactive map exposed an image role around focusable controls. Route changes and validation errors needed clearer keyboard focus.

**Refinement:** Darker supporting text throughout the existing cream-and-pine palette; larger mobile controls and 16px form inputs; current-navigation semantics; correct map grouping; focused error feedback; route focus; inert modal backgrounds; focus trapping and restoration. Calendar labels were also enlarged.

**Verification:** Automated axe-core checks using WCAG 2 A/AA and WCAG 2.1 AA tags found zero violations across 16 screen references at desktop and mobile widths after fixes. Manual scripted keyboard checks passed Tab/Shift+Tab trapping, Escape, focus return, route focus, and error focus, with reduced-motion preference enabled.

## 4. Context, empty states, and returning to your work — passed

**Finding:** Empty trip and expense filters left blank areas. Exploring Maya’s sample switched the tester’s identity without an obvious route back. Mobile pages did not consistently identify the selected trip.

**Refinement:** Clear empty-filter explanations with reset actions; an explicit “Back to my trips” banner while exploring the sample, preserved across reloads; a compact mobile trip switcher. Exploring the sample clears stale return-message feedback.

**Verification:** At both widths, create a personal trip, explore the sample, reload, return to the original workspace, recover from empty trip/category filters, and confirm stored trips and expense totals remain intact.

## 5. Stress, visual polish, and regression — passed

**Finding:** Long names could collide with hero controls; long destinations pushed the tablet header; the mobile return banner could exceed its container. Mobile account settings lacked a direct menu route. Final dialog checks exposed faint screen-index numbers and decorative provider letters in button names.

**Refinement:** Hero sections expand for long text, names and destinations wrap, header content fits, and Edit trip gets a readable dark background. Fixed the return-banner alignment, added account access to navigation, clarified provider button semantics, connected wrapped input hints, and refined focus when dialogs change or navigate to another page. Main content no longer receives a distracting outline around the full document.

**Verification:**

- All 16 specified screen references at 320, 390, 768, 1024, and 1440px: no horizontal page overflow, broken images, or browser runtime errors.
- Long-content stress across eight screens at five widths, plus expense dialogs: no remaining overflow or overlapping hero controls.
- Eleven dialog types and the final two survey stages at two widths: 26 states, zero automated WCAG-tagged violations after the final correction.
- Full desktop/mobile journey: signup, connection consent/failure/cancel, new empty trip, invitation, first event, budget, expense, preferences, and invite acceptance.
- Budget arithmetic, receipt deduplication, reimbursement invariance, transaction undo, assigned-day restrictions, Viewer restrictions, owner permission changes, date-dependent landing, and map controls passed.
- Six domain tests and the TypeScript/Vite production build passed.
- Desktop/mobile screenshots reviewed across all supplied screen references, with individual inspection of entry, trip setup, empty itinerary, budget, active dashboard, expense dialog, and long-content cases.

## Limits of this review

These are automated browser checks and design review, not observed research with representative participants or a formal accessibility certification. Tests used Chromium at simulated viewport sizes; physical iOS/Android devices and VoiceOver/TalkBack were not tested. Keep the planned human UX session: observe whether the tester discovers the new-trip path and completes a trip without coaching.

The app remains a browser-local usability prototype. Connections, account choices, invitations, receipt extraction, location, maps, and transactions are simulated. Sharing the app URL does not synchronize trip data between people. Page 14 remains reserved; Page 16 remains an overlay.

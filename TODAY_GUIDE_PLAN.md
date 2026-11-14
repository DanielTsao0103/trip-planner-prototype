# Today: travel connections and arrival essentials

## Approved direction

Connect the remaining day with readable travel estimates, make saved next-stop information useful on arrival, and offer an optional return journey. Dan rejected the travel/buffer bar: show plain duration and arrival text instead.

## Implementation

1. Keep the existing next-stop guidance and autocomplete. Share the selected travel mode with the remaining day; allow explicit per-connection overrides.
2. Move Rest of today above general reminders. Connect adjacent remaining events using the preceding event's end and location. Show duration, departure, projected arrival, and a clear distinction between late arrival and a reduced arrival buffer. Keep warnings and partial-estimate status visible in the collapsed summary.
3. Request only the chosen mode for each later connection; request alternatives when expanded. Bound concurrency, cancel stale work, and retain honest unavailable states and Google attribution. Driving remains traffic-unaware; no paid-key fallback.
4. Surface existing notes and safe saved links, named companions, and an expandable readable/copyable address. Do not invent ticket data or entry instructions absent from the itinerary.
5. Let the traveler explicitly choose a return destination via shared autocomplete or existing saved/itinerary places. Estimate from the final stop; after the day ends allow an explicit current-location origin. Keep the chosen origin visible, with errors and directions fallback.
6. Store personal travel choices and the return destination separately by account/demo identity and trip on this device. Explain that scope and storage failures. No shared trip-schema or permission changes.

## Validation and release

- Unit checks for timing, missing inputs, midnight arrivals, safe links, and validated personal settings.
- Browser journeys for selected/overridden modes, delayed or failed routes, missing locations, return selection/removal/reload/account isolation, saved details, and mobile layout.
- Independent simulated design review, preserving findings rather than presenting it as human research.
- Build, full existing suite in release workflow, deployment revision verification, and real-provider live checks.

## Deferred

Offline packs, group meeting-point editing, changed-plan notifications, personal skip/done, route detours, and traffic prediction. These were brainstorm options; this release implements the three recommended priorities.

## Completed verification

- 195 unit tests passed; TypeScript and production Pages build passed.
- 128 affected browser tests passed across Today, shared location autocomplete, and event editing; the final layout pass reran all 52 Today cases successfully.
- Chrome and Safari touch checks at 320, 390, 768 and 1440px found no horizontal overflow or browser errors. Automated WCAG A/AA checks of Today found no violations in those reviewed states; dark mode was visually inspected.
- A true 390×844 viewport hit test placed the primary directions button at y=679–725 and confirmed it was unobstructed by fixed navigation.
- Real no-payment Google responses verified next-stop, inter-event, return, and transport-change requests. These checks are distinct from deterministic route fixtures.
- Independent simulated review history (UI / UX): Luna 8.4/8.1 → 8.8/8.9 → 8.8/8.6 → 9.0/9.0; Astra 8.7/7.7 → 8.7/8.6 → 8.8/9.0 → 9.0/9.0. Findings corrected: stale current transit departures, missing current-journey override/reset, premature “Leave now,” ongoing-destination mode loss, quota refresh, preference scope, duplicate copy, and mobile action placement. These scores are not human research or a provider-readiness certification.

Release gates are the hosted full suite and live revision/provider verification. Their run-specific evidence is retained outside the published repository in the task output directory.

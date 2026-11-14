# Today: a travel-day guide

Approved direction: November 14, 2026.

## Purpose

Today helps a traveler decide what to do next and get there prepared. The itinerary remains the place to browse and edit the whole trip.

## Implementation sequence

1. Replace the week agenda and duplicate map with a next-stop card, transportation controls, relevant notes/reminders, timing alerts, and a collapsed remaining-day preview.
2. Calculate walking, transit, and driving routes through the existing no-payment Google Maps Demo Key. Use an explicit origin (previous itinerary stop, entered starting point, or location requested by the traveler). Show source, estimate limitations, a ten-minute arrival buffer, and navigation links. Never use the paid key as a fallback. Bound requests and discard stale results.
3. Use real route durations for departure guidance and the next transfer conflict; identify schedule overlaps independently. Distinguish happening-now activities from the next future activity. Use the trip timezone for account trips, with the existing controllable clock for sample trips.
4. Keep reminders on the existing permission-checked trip save path. Surface existing event notes; do not imply tickets or attachments exist when they do not.
5. Consolidate itinerary navigation into Calendar and Map & list, with Hide/Show map inside the combined view. Preserve old list links, selected dates/events, editing, saved places, calendar gestures, and the trip-wide map.
6. Verify domain rules and provider failure/race cases, browser journeys, responsive light/dark layouts, and existing regression checks. Publish through the established main/Pages workflow and verify the deployed revision.

## First release boundaries

Route-aware detour recommendations and weather are follow-up work, as proposed in the approved concept. This release must not manufacture opening hours, accessibility guarantees, traffic certainty, or personalized recommendations from distance alone. Missing or exhausted routing data retains usable navigation links and explains that times are unavailable.

## Acceptance checks

- No week browser or duplicate map on Today; no separate List tab.
- Clear origin and destination; no claim that a previous stop is the traveler's live location.
- Walking, transit, and driving choices with verified provider estimates or explicit unavailable states.
- Departure time and timing conflicts update with the selected mode, origin, date, and event.
- Completed, empty, overlapping, missing-location, viewer, and offline states stay usable.
- Map collapse preserves the list, selected date/event, and reload state.
- No paid API fallback, new billing, database migration, or unrelated work included.

## Sources

- [Maps Demo Key capabilities](https://developers.google.com/maps/demo-key)
- [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions)
- [Maps URL navigation](https://developers.google.com/maps/documentation/urls/get-started)
- [Routes attribution](https://developers.google.com/maps/documentation/routes/policies)

## Verification record

Implemented in the files described in `IMPLEMENTATION_STATUS.md`.

- Unit checks: 187 passed.
- Live Google Routes: walking, transit, and driving returned HTTP 200 both directly and in the browser using the no-payment demo key.
- Responsive checks: 320, 390, 768, 1024, and 1440px; no horizontal overflow. Axe WCAG A/AA checks found no violations in Today at those widths and in phone dark mode.
- Live Supabase/browser integration: 93 persistence, validation, rollback, isolation, concurrency, and cascade checks passed; disposable accounts/trips were removed. Invitation delivery was intercepted, not sent.
- Regression checks cover old links, selected-stop focus, map collapse/reload/editing, reminder permissions and persistence, stale routing responses, quota failure, explicit location permission, and timeouts.
- Full browser regression: 663 passed, 8 existing skips before integration of the concurrent OKR release; an additional selected-stop/map-collapse test is included for the release gate.
- Deployed revision: pending release verification.

QA logs and screenshots are kept outside the published repository under `outputs/today-redesign-2026-11-14/`.

# Trip Planner

A responsive, clickable travel-planning prototype with a populated fictional Seattle trip and a separate create-your-own-trip journey. Built for desktop and mobile usability sessions.

[Open the live prototype](https://danieltsao0103.github.io/trip-planner-prototype/).

## Try the two journeys

- **Explore the sample trip** opens Maya’s four-day Seattle & Bainbridge getaway, with events, an empty day, four participants, preferences, expenses, and reimbursements.
- **Start a new trip** starts the fictional signup and account-connection flow. From Home, choose **New Trip** to create an independent, empty trip with your own dates and destinations.

Use fictional information. Demo email login uses `maya@example.com` and `travel123`. New fictional accounts use `travel123` for later demo login; entered signup passwords are not stored. Google and Apple flows are simulated account choices.

Open **Prototype** for participant switching, demo dates, location availability, sample restoration, and the numbered screen index. “During” opens the active-trip dashboard. Sample restoration preserves trips created by a tester.

## Local development

```sh
npm install
npm run dev
npm test
npm run build
```

The production build is a static site with hash-based routes. `docs/` contains the published build for GitHub Pages. After a source change, run the build and copy `dist/` into `docs/` before committing to main. The publishing source is main, `/docs`.

## What is real in the prototype

Forms, local state persistence, navigation, itinerary sorting, conflict validation, role restrictions, expense arithmetic, reimbursement states, survey aggregation, map controls, and responsive layouts run in the browser. Changes stay consistent across the screens in that browser.

## What is simulated

Authentication, social/Gmail permissions, confirmation/receipt extraction, crowd estimates, transaction notifications, invitations, nearby location, and map routing use fictional data. There are no real account connections, sent messages, banking signals, payments, geolocation requests, or remote collaboration services. Image inputs show/use local samples; they do not run OCR or send files to a server.

Each tester gets an independent local-storage session. Sharing the website link does **not** share or synchronize a tester’s created trip. Clearing browser storage clears that tester’s changes. This is a usability prototype, not production authorization or account storage.

Trip times use the selected trip time zone. Costs use USD. Overnight activities are entered as separate daily events. Map geometry, routes, distance/time estimates, photographs of fictional venues, and venue suitability are illustrative.

## Product references

- [Zoomable screenshot collage](https://danieltsao0103.github.io/trip-planner-prototype/screens/)
- [Screen and requirement index](SCREEN-INDEX.md)
- [Validation and limitations](VALIDATION.md)
- [Five-round QA and refinement report](QA-REFINEMENT.md)
- Page 14 is intentionally reserved because it was absent from the requirements. Page 16 is a notification overlay.

## Before production

The prototype deliberately demonstrates different messages for unrecognized email and incorrect password. Production authentication should reconsider these messages because they can expose account existence; see [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). Real Gmail data access requires separate authorization and appropriate scope review; sign-in alone does not grant mailbox access. A normal web notification API does not read banking-app notifications. Actual maps, location, provider APIs, and synchronization would require separate integrations.

## Assets

Photographs from [Unsplash](https://unsplash.com/license), bundled for dependable loading. Seattle skyline: `photo-1438401171849-74ac270044ee`; ocean: `photo-1518837695005-2083093ee35b`; city: `photo-1477959858617-67f85cf4f1df`; dining: `photo-1414235077428-338989a2e8c0`; artwork: `photo-1561214115-f2f134cc4912`. Except for the Seattle skyline, photographs serve as travel/venue mood imagery rather than proof of specific locations.

DM Sans and Fraunces are bundled via Fontsource under their open font licenses. Interface icons use Lucide. All names, bookings, participants, costs, and permissions are fictional.

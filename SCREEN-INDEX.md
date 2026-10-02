# Screen and requirement index

Use the Prototype button inside the app for clickable page references and scenario controls. The app must first have a fictional signed-in user; trip pages require an accepted selected trip. Pages have separate desktop/mobile compositions using the same state.

| Reference | Screen / interaction coverage |
|---|---|
| 1 | Login default; signup switch; email/Google/Apple in both modes; specific fictional errors; unknown provider → account creation; direct sample entry |
| 2 | Instagram/Facebook/TikTok/Gmail checklist; individual granted/needed permissions; partial consent; separate Gmail consent; skip warning |
| 3 | Provider authorization simulation; success, canceled, failure/retry; return to updated checklist |
| 4 | Home; three-line navigation menu; full-width New Trip and Open existing trip actions; three destination ideas; sample-trip entry; Coming soon state |
| 5 | Accepted created/invited trips; past/upcoming/active filters; invitation acceptance; Open → 8; Add event with correct trip |
| 6 | Create/edit title, destinations, dates, time zone; minimum one destination; simulated Viewer invitations; date validation; new trips start empty |
| 7 | Manual event fields; date/start/end, estimated cost, attendees; illustrative crowd level; local confirmation upload/sample extraction review/failure; conflicts; save to correct day |
| 8 | Chronological day groups with image/place/time; multiple days/events; empty day; links to day detail, suggestions, event creation, trip editing |
| 9 | Suggestions based on planned/current demo context and preferences; group walking limits; available time slot; accept into event review; decline; empty/no-match states |
| 10 | Active-date dashboard; week/day links; shared to-dos; next-stop map; mobile day strip/agenda; before/during/after demo control |
| 11 | Day timeline; date/previous/next navigation; event details; permission-aware add/edit; Map entry; cross-screen updates |
| 12 | Budget amount/mode; group or individual shares; pie chart/legend; expense log; manual/receipt entry; Gmail dedupe; demo transaction/undo; split expense notifications; creditor-only repayment completion |
| 13 | Group preference tiles with contributor counts/names; invited/accepted collaborators; Owner/Editor/Viewer/assigned days; host invitations/removal/permissions |
| 14 | Reserved. No requirement was supplied; no invented product page. |
| 15 | Food/diet/restrictions, spending/dining/atmosphere, activity/destination, accessibility/walking, tickets and other constraints; save/edit updates group |
| 16 | Nearby suggestion overlay; separate straight-line and walking measurements; Go → selected map route; No dismiss; location/active-date/walking-limit gating |
| 17 | Interactive illustrative map; places, simulated position, selected route; pan/zoom/recenter/marker selection; desktop side panel and mobile expandable route panel |

## Overlay index

Account chooser; unknown-account signup prompt; provider consent; skip warning; navigation menu; trip chooser; invitation acceptance; host invite form; role/day selection; event import review; budget settings; manual/receipt expense form; receipt match review; transaction preview/undo; reimbursement confirmation; nearby suggestion; prototype controls/screen index. Unsaved forms and member removal use native confirmation dialogs.

## Shared rules

- Owner controls trip settings, membership, and budget mode; Editor edits all itinerary days; Day Editor edits assigned dates; Viewer reads shared plans.
- Everyone can edit their own preferences and record their own expenses. Only the creditor can complete a reimbursement.
- Money uses integer cents. Reimbursements do not count as new spending. Matching a known receipt does not duplicate its expense.
- Calendar links to Page 11. Page 10 is an active-date landing, while selecting an existing trip always opens Page 8.
- A trip selection is required for trip tools. New trips and built-in samples remain independent.

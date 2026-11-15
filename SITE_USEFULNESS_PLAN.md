# Site usefulness audit and implementation

## Aim

Help travelers decide what to do next, keep context between pages, and turn ideas into workable plans. Today remains the in-trip guide; Calendar and Map & list remain the planning workspace. Do not add another itinerary list or dashboard of duplicate numbers.

## Review method

Independent simulated traveler and designer reviews covered planning, people, and utilities. These are expert/persona walkthroughs, not research with actual travelers. Verify recommendations against current source, realistic fixtures, keyboard interaction, mobile layouts, permissions, and existing persistence contracts.

## Page decisions

| Page or flow | Job | Implementation decision |
| --- | --- | --- |
| Home | Resume a relevant trip | Order active trips first, nearest upcoming next, recent past last; label timing on compact cards. |
| My trips | Find and open a trip | Search title/destination, chronological ordering, remember filters within the session, hide unavailable editing actions. |
| Create/edit trip | Establish trip details | Preview which existing plans fall outside edited dates; retain validation, invitations, cover and timezone controls. |
| Calendar | Arrange the schedule | Synchronize week navigation with selected date; add a date jump for long trips. Preserve drag, precise times and agenda. |
| Map & list | Understand plans geographically | Show real schedule openings in a labeled daytime window; make location links reveal a collapsed map. |
| Event editor | Place a plan at a workable time | Show conflicts and selectable free intervals beside time fields, preserving entered duration and exact typed minutes. |
| Suggestions | Keep and develop ideas | Lead with the existing persisted saved-place shortlist and a selected planning day; retain clearly labeled sample inspiration. |
| Nearby | Research actionable candidates | Direct review in editor, permission-aware scheduling, save researched places for later with source notes. |
| Full map | Focus on relevant locations | One-click focus on a day, preserve date for nearby research and return navigation; retain multi-day selection. |
| Group | Understand needs and participation | Expose who has not shared preferences, with a self-service link for the current traveler. Retain existing charts and role controls. |
| Preferences | Share intentional constraints | Review the actual answers before saving, including sensitive dietary/accessibility fields. |
| Connections/consent | Explain optional previews | Keep simulation explicit; move failure simulation under sample tools. |
| Budget, expenses, repayments | Understand spending and settle shares | Retain existing contextual setup, empty-state actions, ledger and repayment controls. No extra duplicate summaries or changed money rules. |
| Account, Style, sign-in/recovery | Manage identity and appearance | Retain purposeful workflows; regression-check instead of adding features. |
| Admin | Choose an available tracker | Distinguish implemented trackers from placeholders without inventing objectives. |
| Daniel/Ivy OKRs, admin access | Inspect confirmed metrics and access | Preserve definitions, server authorization, history and last-admin protection. |
| Seth/Drew OKRs | Truthful reserved workspace | Retain empty states until an objective is supplied. |
| Today | Navigate the current day | Preserve the completed redesign and provider fallback behavior. |

## Guardrails and verification

- Availability means unused schedule time between 9 AM and 6 PM, not travel feasibility, opening hours, or reservations. Travel estimates remain on Today.
- Reuse existing trip writes and saved-place fields; no new database schema or provider subscription.
- Test merged/overlapping events, boundary times, edited-event exclusion, Day Editor/Viewer permissions, saved ideas, date continuity, search recovery, narrow/dark layouts, and keyboard flows.
- Keep provider requests mocked during automated QA; the free Google demo Routes allowance was exhausted in the previous task.
- Run unit tests, production build, targeted browser checks, independent review, and the deployment suite. Verify the published revision and important public flows before reporting completion.

## Status

Implemented and locally verified: 200 unit tests, 747 browser tests (8 existing conditional skips), and 42 live persistence-contract checks passed. The production build passes. The public Pages workflow repeats the build/browser gates and verifies its published revision.

Independent simulated reviews prompted fixes to map camera/filter continuity, changed research context, interrupted photo attribution, date-change warnings, preference-default explanations, touch targets, and skip-link visibility. Reviewers differed in their scores; no universal 9/10 or human-research result is claimed. The external QA report retains earlier lower ratings and the map fixture limitation.

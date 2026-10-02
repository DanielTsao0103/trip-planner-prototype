# Validation and remaining limits

Validated October 1, 2026. The implementation includes the 16 supplied screen references (1–13, 15–17); Page 14 remains explicitly reserved. Page 16 is an overlay.

The subsequent five-round UI/UX refinement is documented in [QA-REFINEMENT.md](QA-REFINEMENT.md), including the final screen, dialog, keyboard, and stress checks.

## Passed

- TypeScript check and Vite production build.
- Six domain tests: date boundaries/leap day, exact-cent allocation, role restrictions, event moves across permitted days, overlap/overnight validation, and reimbursement invariance.
- Desktop (1440px) and mobile (390px) user journeys: fictional signup, connection success/partial/cancel/failure, skip warning, new empty multi-destination trip, dates, Viewer invitation, manual event, budget setup, expense, three-step survey, group aggregation, and invitation acceptance.
- Budget arithmetic: $1,940 spent/$1,060 remaining fixture, Gmail matching without duplication, creditor completion without new spending, demo transaction and undo, and $485 individual allocation.
- Viewer restrictions, assigned-day editing, visible scheduling conflict, creditor-only settlement, and Owner role changes reflected immediately.
- Active/past date landing, existing-trip opening, nearby suggestion to selected map route, zoom and recenter.
- Every supplied screen reference rendered at 320, 390, 768, 1024, and 1440px: no horizontal page overflow, broken images, or browser runtime errors.
- Desktop and mobile screenshots reviewed for all supplied screen references. Mobile trip dates stack to avoid native date-control overflow.

## Explicit limitations

- All third-party services and travel estimates are simulated. The map is an interactive illustrative map, not live Google Maps navigation.
- State is saved per browser. There is no remote account service, simultaneous multi-user backend, or cross-device trip synchronization.
- Only fictional account details should be used. Demo login password is `travel123`; signup passwords are not retained.
- Receipt and confirmation extraction use sample fields. Uploaded images are local, with no actual OCR or server upload.
- No messages, invitations, transactions, or payments are sent by the prototype. Reimbursement completion is a local recorded state.
- USD only. Events use the trip time zone; overnight activities are split into daily entries.
- Photography for fictional venues and non-Seattle examples is representative mood imagery. Food/accessibility suitability must not be treated as verified.
- Page 14 has no supplied requirements and is reserved, rather than silently renumbered or invented.

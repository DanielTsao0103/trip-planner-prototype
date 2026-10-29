# Implementation status

Source audit: October 28, 2026. This describes the code in this checkout, not a fresh verification of the deployed database or external services. Budget (12) and Suggestions (9) omit implementation commentary, including the shared footer. Other pages and dialogs retain their existing notes. Keep the technical details here and beside the relevant handlers. A clean interface does not mean every action is backed by a server.

## Persistence boundary

- `src/auth.tsx` calls Supabase Auth for email/password signup, login, session loading, and sign-out. The account-created trigger in `supabase/migrations/20261010194129_auth_only_lucid_schema.sql` creates the public profile. The old `Auth` component in `onboarding.tsx` is not routed by `main.tsx`.
- `src/state.tsx` calls `saveAccountTrip`, `loadAccountTrips`, and `deleteAccountTrip` for signed-in account trips. Sample trips and Maya's standalone demo bypass those server writes.
- `src/account-trips.ts` writes only title, destinations, start/end dates, and time zone (plus identity/ownership on creation). Updates/deletes check the revision. The membership migration creates the owner's membership atomically; it does not make the UI's invitees into database members.
- `mutate` and `updateTrip` change React state. An effect writes that state to account-scoped `localStorage`. This can survive a reload on the same browser; it is not server persistence or collaboration.
- `tripFromRow` merges real core details with cached events, members, preferences, expenses, budgets, todos, and dismissed suggestions. Those extra fields will be absent in a fresh browser. Saving core trip details does not upload them.

## Page and action audit

| Page / area | What exists | What is still local or simulated | Where to implement the next real change |
| --- | --- | --- | --- |
| 1: Account entry | Supabase email/password auth and profile trigger | Google/Apple buttons only show a preview notice; Maya is a local session | `auth.tsx`, `main.tsx`; wire OAuth before claiming provider sign-in |
| 2–3: Connections and consent | Selectable service permission controls | `user.connections` stores local strings; no OAuth scopes, tokens, Gmail reads, or social reads | `onboarding.tsx` Connections/ConnectProvider; replace local grants with provider authorization |
| 4: Home | Account context, trip navigation | Destination cards, imagery, and travel estimates come from fixtures | `onboarding.tsx` Home; add a sourced destination/price service |
| 5–6: Trips and trip form | Account core-detail list/create/update/delete; validation and save failure recovery | Sample trips, trip images, budgets and invited members remain local, even when core details save | `account-trips.ts`, `state.tsx`, `onboarding.tsx` TripForm; persist each extra field through an authorized service |
| 7: Event editor | Local event CRUD and validation | Upload is a temporary object-URL preview; extraction fills fixed sample fields after a timer. No upload service or OCR. Crowd estimates are hardcoded | `planning.tsx` EventForm/extract; add event storage, file storage/OCR and sourced crowd data |
| 8 and 11: Itinerary / day detail | Local events, dates, editing permissions, todos | Events and todos never sync; participant permissions here are client-side UI rules | `planning.tsx`, `domain.ts`, `state.tsx`; persist records and enforce authorization on the server |
| 9: Suggestions | Filters and preference matching over an in-code set of ideas | No AI/recommendation service, live crowd/cost/suitability feed, social access, or geolocation lookup; accept/dismiss only changes local events/state | `planning.tsx` Suggestions; replace fixture generation and persist decisions |
| 10: Today | Dashboard derived from local events/todos | Date/time use the stored testing clock, not automatic current time; the location flag is not GPS | `planning.tsx` Dashboard, `data.ts`, `overlays.tsx` Demo; replace clock/availability inputs as needed |
| 12: Budget and expense dialogs | Local budgets, expense arithmetic, split shares, and settled markers | No finance database writes. Receipt scans fill fixed fields; Gmail matching uses a fixed receipt. Transaction simulation inserts a fixed coffee expense. Shared expense confirmation sends no message. Mark paid records a flag; no money moves | `finance.tsx`, `overlays.tsx` Gmail/settle/transaction; add persistence and separately implement OCR, messages or payment integrations |
| 13: Group and invitation/role dialogs | Local members, invitations, role/day editing, acceptance and removal | No email delivery, invitation token, shared membership mutation, or cross-account sync. Accepting an invite switches the local participant; it is not real account authentication | `group.tsx`, `overlays.tsx` Invite/Permissions/invitation; wire authorized membership and invite flows |
| 15: Preferences | Local survey answers used by suggestions | No server save or cross-account sharing of survey answers | `group.tsx` Survey; add per-member persistence and access rules |
| 16: Nearby alert | Conditional local popup | Cedar Gallery, 420-foot proximity, 700-foot route and four-minute duration are fixtures; no background geofence, OS notification, or live suitability check | `overlays.tsx` nearby; connect real locations, routing and notification delivery |
| 17: Map | Google Maps and geocoding when configured/loaded; browser geolocation with permission; external Google Maps directions link | Without a working key, SVG map coordinates and route figures are illustrative. Live map availability does not make suggestion/nearby fixtures live. Location is not saved to the trip database | `travelmap.tsx`, `google-maps.ts`; keep real map and fallback boundaries explicit |
| Shared shell and dialogs | Navigation, sample return, validation, save/reload errors | Prototype controls alter local participants, testing clock, location flag and sample fixtures; pre-planned trips are unavailable | `ui.tsx`, `overlays.tsx`, `prototype.tsx`; Page 14 remains reserved |

## Rules for later work

1. Follow the handler to its actual network call. A toast saying “saved,” “connected,” or “invited” is not proof of a server write.
2. Do not infer database authorization from the local participant selector, role flags, or matching email addresses.
3. Before marking a feature server-backed, add its persistence/integration and verify reload plus a fresh browser/account where applicable, including failed writes and permission checks.
4. Update this file and the nearby source comments with that feature. Keep ordinary validation, save-failure recovery, unavailable-action feedback, and clearly named sample actions in the UI. Hide implementation notes only on Budget and Suggestions; preserve the other pages and dialogs, including their shared footer.

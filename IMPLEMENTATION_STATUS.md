# Implementation status

Source and live database audit: October 28, 2026. Full account-trip persistence is verified with disposable QA accounts; external simulations are not implemented services. Budget (12) and Suggestions (9) omit implementation commentary, including the shared footer. Other pages and dialogs retain their existing notes. Keep the technical details here and beside the relevant handlers. A clean interface does not mean every action is backed by a server.

## Persistence boundary

- `src/auth.tsx` calls Supabase Auth for email/password signup, login, session loading, and sign-out. The account-created trigger in `supabase/migrations/20261010194129_auth_only_lucid_schema.sql` creates the public profile. The old `Auth` component in `onboarding.tsx` is not routed by `main.tsx`.
- `src/state.tsx` calls `saveAccountTrip`, `loadAccountTrips`, and `deleteAccountTrip` for signed-in account trips. Sample trips and Maya's standalone demo bypass those server writes.
- `src/account-trips.ts` sends complete account trips through validated transactional RPCs. Root fields, event attendees, guest roles/days, preferences, budgets, expense shares/repayments, reminders, and dismissed IDs persist in normalized tables. Ownership and revisions are checked server-side. Guest planner IDs never grant Auth-account membership.
- `mutate` and `updateTrip` enqueue account trip changes immediately. The save queue serializes edits, retains failures for explicit retry, and reports confirmed database status. Browser storage contains demo data plus temporary pending recovery; successful account trip copies are removed.
- `tripFromRow` treats full database bundles as authoritative. A metadata-only legacy trip can import old browser details once, only when the database already assigns that trip to the signed-in account. Legacy IDs and historical traveler references are preserved through remapping.

## Page and action audit

| Page / area | What exists | What is still local or simulated | Where to implement the next real change |
| --- | --- | --- | --- |
| 1: Account entry | Supabase email/password auth and profile trigger | Google/Apple buttons only show a preview notice; Maya is a local session | `auth.tsx`, `main.tsx`; wire OAuth before claiming provider sign-in |
| 2–3: Connections and consent | Selectable service permission controls | `user.connections` stores local strings; no OAuth scopes, tokens, Gmail reads, or social reads | `onboarding.tsx` Connections/ConnectProvider; replace local grants with provider authorization |
| 4: Home | Account context, trip navigation | Destination cards, imagery, and travel estimates come from fixtures | `onboarding.tsx` Home; add a sourced destination/price service |
| 5–6: Trips and trip form | Full account trip create/read/update/delete, atomic saves, validation, recovery | Samples are local; image URLs save but there is no custom trip-image upload feature | `account-trips.ts`, `state.tsx`, `onboarding.tsx`; add collaboration-aware updates later |
| 7: Event editor | Database event create/edit/delete, notes, image URL, times, costs and attendees | Upload is a temporary preview; extraction fills sample fields. No object storage/OCR; crowd estimates are fixtures | `planning.tsx`; add file storage/OCR separately |
| 8 and 11: Itinerary / day detail | Database event reads/edits and permission-aware UI | Actual cross-account collaboration is not enabled; the owner performs account writes | `planning.tsx`, `domain.ts`; add collaborator-specific RLS |
| 9: Suggestions | Existing fixture filters; accepted event and dismissed ID save for account trips | Recommendation engine/crowds/cost/suitability remain illustrative | `planning.tsx`; no suggestion-engine expansion in this release |
| 10: Today | Database reminders and completion/deletion; account clock starts at current device date/time | Demo controls can simulate date/time; location flag is not GPS; clock does not tick automatically across midnight | `planning.tsx`, `state.tsx`, `overlays.tsx`; clock refresh can be added separately |
| 12: Budget and expense dialogs | Database group/individual budgets, expenses, integer-cent shares and repayment markers; settled history protected | Receipt scans, Gmail match and bank transaction remain fixtures; no messages or money move | `finance.tsx`, `overlays.tsx`; integrations require separate services |
| 13: Group and invitation/role dialogs | Database guest travelers, pending/accepted/removed status, roles and editable dates; historical allocations retained | No invitation email/token or real cross-account access. Demo acceptance can switch fictional identity; account guest acceptance does not | `group.tsx`, `overlays.tsx`; implement actual invitations and membership authorization later |
| 15: Preferences | Database survey answers used by existing group summaries | No cross-account sharing until real collaborator access exists | `group.tsx`; extend RLS with real collaboration |
| 16: Nearby alert | Conditional local popup | Cedar Gallery, 420-foot proximity, 700-foot route and four-minute duration are fixtures; no background geofence, OS notification, or live suitability check | `overlays.tsx` nearby; connect real locations, routing and notification delivery |
| 17: Map | Google Maps and geocoding when configured/loaded; browser geolocation with permission; external Google Maps directions link | Without a working key, SVG map coordinates and route figures are illustrative. Live map availability does not make suggestion/nearby fixtures live. Location is not saved to the trip database | `travelmap.tsx`, `google-maps.ts`; keep real map and fallback boundaries explicit |
| Shared shell and dialogs | Navigation, sample return, validation, save/reload errors | Prototype controls alter local participants, testing clock, location flag and sample fixtures; pre-planned trips are unavailable | `ui.tsx`, `overlays.tsx`, `prototype.tsx`; Page 14 remains reserved |

## Rules for later work

1. Follow the handler to its actual network call. A toast saying “saved,” “connected,” or “invited” is not proof of a server write.
2. Do not infer database authorization from the local participant selector, role flags, or matching email addresses.
3. Before marking a feature server-backed, add its persistence/integration and verify reload plus a fresh browser/account where applicable, including failed writes and permission checks.
4. Update this file and the nearby source comments with that feature. Keep ordinary validation, save-failure recovery, unavailable-action feedback, and clearly named sample actions in the UI. Hide implementation notes only on Budget and Suggestions; preserve the other pages and dialogs, including their shared footer.

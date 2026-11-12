# Trip Planner prototype

Build the approved responsive travel prototype. Page numbers 1–13 and 15–17 are stable; Page 14 is reserved. Supabase provides real email/password signup, login, and sign-out. Successful authentication opens the planner. Account trip creation, editing, listing, deletion, and all structured planning details use Supabase. Sample/demo trips remain browser-only. Supabase project credentials belong only in the ignored local environment files.

## Workflow

User approved direct commits to main and public GitHub Pages hosting on October 1, 2026. Keep intermediate QA artifacts out of the published repository. Build and check desktop/mobile core journeys before deployment. Use typed domain rules for dates, permissions, and money. Supabase stores authentication, profiles, and complete account trip details. Demo data and temporary unsaved recovery drafts stay locally separated per account; preserve the older trip-planner-v1 browser save when importing it.

## Corrections & Lessons Learned

- Receipt automation clarification (November 2, 2026): travelers must email receipts to a dedicated Gmail inbox. Model the planned workflow as emailed receipt ingestion, not scanning a traveler's connected personal inbox. The admin portal and automation remain planned.
- Architecture diagram clarification (November 2, 2026): show the receipt sequence as connected visual steps inside the diagram: email receipt, AI extraction, admin review, Supabase save, and customer display. A footer sentence alone is not enough.

- A populated fictional trip must coexist with a genuinely empty new-trip flow for usability testing.
- Calendar maps to Page 11 with date navigation; Page 10 is restricted to active dates.

- Prevent the native default action of non-submit buttons: React can reuse a Next button as a submit button during a form-step update, causing premature submission.

- Validate secondary text and dialogs as well as primary screens; combine automated accessibility checks with visual review.
- Keep a clear return to the tester’s own workspace when entering the sample.
- Long trip names should expand the hero and wrap within layouts rather than cover controls.
- A mobile layout must retain access to account settings even when desktop profile controls are hidden.

- Supabase scope correction (October 10, 2026): Dan already has a Supabase project; prepare this repo to connect to it. Do not create a project, tables, anonymous-auth workspaces, or replace the data model as part of connection preparation.
- The authoritative source is this trip-planner checkout, not the separate Desktop travel-planner-prototype repo.

- Scope expanded at Dan’s explicit request on October 10, 2026: connect app persistence to the existing Supabase project. Use the existing core tables with additive per-account metadata; preserve unassigned group records. Never infer ownership of existing rows from an unverified identity.

- Latest scope correction (October 10, 2026): use Lucidchart Page 1 as the five-table schema. Revert the planner JSON fields, planner_accounts, save/load RPCs, and trip persistence. Only real email/password signup, login, and sign-out are active; keep existing group records intact. Passwords belong in Supabase Auth, never public.user.password.

- Dan clarified that this is a low-fidelity class prototype: keep the login vertical slice simple and add verification later. Email confirmation was explicitly disabled at his request; do not expand scope to email providers or other account features now.

- Post-login correction (October 10, 2026): Dan wants real signup/login to open the existing demo app directly, not a login-success placeholder. Trip screens, sample trips, and browser-saved demo edits must remain available without live trip database reads or writes. The old fictional credentials are not Supabase accounts; use Explore sample trip after real login.

- Login entry options (October 10, 2026): provide one-click local Maya demo access without requiring an account. Keep its browser storage separate from real accounts. Google and Apple login buttons are explicitly prototype previews until Dan requests real provider setup.

- Provider button styling: use the official Google/Apple artwork and approved Sign in with wording. Keep prototype badges outside branded button artwork, and preserve logo proportions and brand colors.

- GitHub Pages publishing correction (October 10, 2026): deploy current source using .github/workflows/pages.yml and Pages source GitHub Actions. Commit source only; generated docs/dist are not authoritative. Tests and the production build must pass before deployment; verify live version.json matches the deployed commit. This replaces the earlier manual main:/docs workflow.
- Demo navigation must not clear the participant as a substitute for signing out. Sample return controls must remain reachable after changing fictional participants, and re-entering the sample must preserve the original return account.

- Use a neutral login greeting (Welcome to Stir Crazy); the app does not know whether a signed-out visitor is returning.

- Scope expanded October 28, 2026: Dan requested a working Create trip / Save trip vertical slice tied to the signed-in account. This supersedes earlier auth-only restrictions. Use the existing trip table, database-enforced ownership, confirmed saves, failure recovery, and reload/fresh-browser verification; preserve old group records and local sample data.

- Schema clarification October 28, 2026: the initial schema may be extended as features need. Keep relational constraints, migrations, validation, and RLS. Trips have one owning Auth account (`owner_id`) and separate account memberships/roles (`trip_member` → `role`); create the owner membership atomically. Future collaborators (Editor/Viewer) must not be modeled as additional owners or inferred from client-only participant data.

- Field limits agreed October 28, 2026: use src/limits.ts for text, invitation, and money limits; validate both form inputs and save handlers. Keep the database trip validator aligned with the 100-character title and 220-character destination limits. Show character counts and preserve existing oversized text until the user edits it.

- UI copy scope correction (October 28, 2026): Dan wants implementation notes removed only from Budget and Suggestions, including the shared footer on those routes. Restore and preserve notes on all other pages and dialogs. Keep real versus simulated behavior documented in source comments and IMPLEMENTATION_STATUS.md; update that reference when wiring real services.

- Definition-of-done scope (October 28, 2026): Dan explicitly limited this release to the Budget/Suggestions note cleanup and requested responsive QA, live backend regression, Lighthouse Accessibility >=90, README Complete/Not complete requirements, main-branch integration, and public cloud deployment. This is authorization to publish the verified feature; it is not a request to implement unrelated prototype backends.

- Live-site completion correction (October 28, 2026): navigation fixes requested for the hosted app must be deployed and verified on GitHub Pages before reporting completion. Local build and browser checks alone do not update the site Dan is using.

- Field-limit definition-of-done scope (October 28, 2026): Dan clarified “just the task I gave you for this chat.” Verify and publish the field-limit feature through its existing live account-trip path; do not convert local event, budget, preference, reminder, or invitation previews into backend features for this task.
- Persistence scope expanded October 28, 2026: Dan wants all structured trip details database-savable, with robust tests, while avoiding expansion of auto-suggestions. Persist events/attendees, guest travelers/roles/day assignments, preferences, budgets, expenses/shares/repayment markers, reminders, and dismissed suggestions. Keep actual account invitation delivery and simulated OCR/banking separate.
- Application revision conflicts must use `PT409`, not PostgreSQL serialization code `40001`: hosted PostgREST may repeatedly retry the latter. Verify conflicts against the real API, not only mocks.
- Financial participant foreign keys must be deferred for a whole-trip cascade; removing one traveler retains their historical identity and allocations. Test both removal paths.
- Browser previews from other checkouts can invalidate QA: use `PLAYWRIGHT_PORT` for an isolated port when another task has a preview running. Preserve concurrently published UI changes before deployment.

- Trip-persistence definition-of-done scope (October 28, 2026): Dan explicitly requires responsive desktop/mobile pages, end-to-end user/frontend/backend/database behavior, Lighthouse Accessibility >=90, README Complete/Not complete requirements, main-branch integration, and public deployment for this specific persistence task only. Verify the real account-trip states, including save recovery; do not expand recommendations or unrelated integrations.

- Home copy correction (October 28, 2026): hide the idle “All trip changes saved to your account” message on Home only. Keep saving/error recovery feedback and the other pages unchanged.

- Save-feedback correction (October 28, 2026): Dan expanded the request to remove the permanent saved banner everywhere and show a small bottom-right “Changes saved” notification after confirmed account writes. Show no success on initial load or failed/pending saves; retain recovery controls.

- Breadcrumb navigation (October 29, 2026): the top bar must link back to actual parent screens, not display a decorative destination. Derive the trail from the current route, preserve date context for event parents, and keep all levels reachable on tablet and mobile.

- Forwarded bookings (October 29, 2026): Dan approved a free Mailtrap inbound inbox plus a Supabase Edge Function and `forwarded_booking` table so accounts can forward confirmation emails. No custom domain, no AI parsing, no spending. Store extracted fields only. Secrets stay in Supabase and GitHub settings, never in `VITE_` variables or chat.


- Map provider correction (November 6, 2026): Dan wants the existing Google Maps JavaScript API on the Map tab. Preserve the hosted browser-key wiring and verify real Google imagery and interactions on desktop and mobile before publishing map changes.

- Itinerary pin correction (November 6, 2026): opening the Google Map must automatically place unpinned itinerary addresses for owners and viewers, including existing events, without choosing a stop first. Preserve user-adjusted pins.

- November 6 itinerary location correction: accept complete location text without a 220-character cap or counter. Resolve the location during itinerary save and reuse it on the map. A named area should receive a labeled center pin. Keep address entry in the itinerary only.

- November 6 map and field refinement: Map stops open their exact daily itinerary item, including for viewers. Hide routine character counters across the site. Allow 2,048 characters for new or changed itinerary addresses and preserve previously saved longer addresses.

- Use the theme’s paper and ink colors together for the invite email field. Check typed, unselected text in both light and dark mode.

- Use the same destination-neutral travel photos for every trip invitation, regardless of the trip cover or destination.

- Calendar dragging uses the event’s top edge and rounds to the nearest minute. Aligning that edge with the 10 AM line must save 10:00 AM wherever the card was grabbed.

- Account trip changes must save to the live database, resume after interruption and reach other open planner screens. Verify the published site with independent signed-in browser sessions.

- Email invitations must open the normal login and signup options. Preserve the exact trip while the traveler chooses an account, including a different email, then open its preference survey.

- Anchor custom dropdowns to the input itself, leaving only enough space for its focus outline. Destination suggestions should match the text field width and stop before the Add button.

- Group permissions (November 6, 2026): invited accounts start as Viewers. Only the owner can grant Editor or Day Editor access. Check both dates for event moves, enforce grants on database writes, and show a simple permission prompt when an edit is denied.

- Invitation email correction (November 6, 2026): send an invitation email to existing accounts too. The same initial account screen selects login for existing accounts and signup for new invitees; preserve the exact trip through authentication. Remember valid sessions, but never infer account access from a browser-visit cookie.

- Invitation expiry (November 6, 2026): all newly sent trip invitations last seven days. Enforce expiry on the server without expiring accepted trip memberships or extending unrelated password-reset links.

- Sprint audit scope clarification (November 7, 2026): Dan's definition of done applies only to the seven screenshot features: edit account, profile pictures, immediate post-join trip preferences, collaborators sharing the same map pins, invitations, correct map/day itinerary linkage, and readable group preference charts. Do not count unrelated unfinished OCR, banking/payments, nearby alerts, or other prototype integrations against this sprint. Distinguish API-mocked browser checks from live multi-account/inbox/database verification.

- Additional sprint audit scope (November 7, 2026): Dan added editable itinerary pictures and database-backed budget information as two further screenshot features to check against the same definition of done. Audit these independently of unrelated unfinished prototype integrations.

- Saving investigation (November 8, 2026): stay within existing persistence features. Recovery records must be isolated across tabs, discoverable after interruption, and retired only after a safe transfer or confirmed completion. Test two simultaneous unsaved trips, not just one tab's retry. Legacy RPC-created trips can have empty destination timezone arrays; repair these only through the owner's existing save path, preserving collaborator permission checks.

- Reliability review (November 8, 2026): follow `PERSISTENCE_CONTRACT.md` for every persistence change. Use actual Web Lock ownership before adopting another tab's backup, validate all nested recovery data, and report storage failures honestly. Owner trip content/timezones/photo credit belong in one server transaction; do not restore separate credit upserts. Add database round-trip and concurrency checks when extending persisted fields, and distinguish automated mocked CI checks from explicit live-database verification.

- Currency refresh correction (November 10, 2026): Dan wants weekly automatic exchange-rate checks, not hourly. Preserve manual refresh and visible rate dates; focus/reconnect must reuse rates within the seven-day cache period.

- Budget UX correction (November 10, 2026): prioritize balances and the expense ledger; keep currency conversion compact and collapsed at the bottom with a small shortcut, not a dominant card above expenses. Avoid duplicate totals and simulated confirmation popups. Agent persona scores are simulated reviews, never human-user research.

- Budget review continuation (November 11, 2026): Dan requested continuing until the 9.5 panel target is met. Keep independent scores and earlier evidence intact; compare the unrounded panel mean against the target, and distinguish simulated reviewer ratings from human-user evidence. Verify long mobile forms with the complete Save control visible, including after expanding split participants.

- Budget action placement (November 11, 2026): Dan wants Add expense at the top right of the expense log card, rather than the page heading. Keep it within the card on small screens without crowding the tabs.

- Pages CI reliability (November 11, 2026): Ubuntu mirror DNS failures blocked browser dependency installation. The test/build job uses the official Playwright image, pinned by digest; keep its version matched to @playwright/test when updating dependencies. Preserve the full unit/browser/build and live-revision gates.

- Budget UX-only review (November 11, 2026): Dan requested a 9.6 quality check focused solely on UX. Evaluate observed clarity, effort, readability, and interaction comfort independently from engineering tests; preserve actual scores and do not claim an unmet target. Keep the Add action at the ledger’s top right, using a compact label on narrow screens with the full accessible name.

- Budget UI and UX continuation (November 11, 2026): Dan requires honest independent ratings of at least 9.6 in both UI and UX. Keep the original UX rubric for comparisons, report UI separately, retain all lower scores, and exclude exploratory rubric changes from acceptance. Fix observed interaction and visual issues between frozen review rounds; never raise a score by changing its definition.

- App-wide design standard (November 11, 2026): Dan approved the Budget design as the baseline across the entire app. Read and follow DESIGN.md for all UI work. Implement reusable rules through src/design-system.css and shared ui.tsx components, preserve functional behavior and theme choices, and verify phone/tablet/desktop and dark-mode layouts. Budget review scores do not automatically apply to other pages.

- Site-wide refinement scope (November 11, 2026): Dan requires local UI/UX review-and-revision rounds for every implemented page and touchpoint, on mobile and desktop, until each reviewed area reaches 9.7 in both UI and UX. Preserve Ivy’s logo, theme colors, heading fonts and design choices across variants. Fetch the latest repository first. After the design gate, run complete implemented-feature and live database-saving verification, fix failures, and only then publish to the main GitHub Pages site. Do not substitute a site average for a failing page, count previews as live services, or promise zero undiscovered bugs.

- Site-wide audit coverage (November 11, 2026): exercise Today with dates inside the trip, not only its inactive empty state. Hidden chart tooltips must not create document overflow; check long names before and after focus/hover and keep only one tooltip visible.
- Calendar browser-test lesson (November 11, 2026): for horizontally scrolling overlap grids, begin the actual pointer drag before scrolling the destination into view. Otherwise automation can initiate the drag on a different event after the source shifts. Assert the intended dragged event and saved minute after reload.
- Mixed-input tooltip lesson (November 11, 2026): leaving a previously hovered chart item must not dismiss another item’s keyboard-focused tooltip. Keep one bounded tooltip visible, allow Escape dismissal, and expose complete names through the existing detail dialog.
- Recovery feedback lesson (November 11, 2026): editing or resetting a style preview must not retain a success sentence that implies the new preview was saved. Likewise, a successful expense deletion must replace the previous expense-recorded message.
- Fixed phone action bars must leave focused fields and validation messages fully visible. Check actual bounding boxes after keyboard navigation and repeated invalid submissions, not only whether an element intersects the viewport.
- Inverse chart tooltips must explicitly carry their foreground color to helper text; global small-text colors can silently defeat contrast. Inspect selected and hovered control colors after transitions settle.
- Long repayment descriptions may wrap, but money and completion labels must not split. Fixed action bars must reserve bottom-navigation space only when that navigation exists.

- Native form validation must open a collapsed disclosure before focusing its invalid required input. An inactive-date trip filter is not proof that the account has no trips; preserve the distinction in empty-state actions.
- A saved trip remains accessible when invitation delivery fails. Preserve failed recipients for retry while on the form, and offer an explicit Continue action without implying background email delivery.

- Saving an itinerary item must return to its exact day and event, including later pages; do not silently reset to the first trip day. Feedback belongs to its originating task, so connection outcomes must never appear inside the budget ledger.
- Keep individual expense share and full amount together independently of a wrapping title. Reduce redundant field margins before shrinking text or touch targets.

- Native select height can differ across browser engines despite minimum-height CSS. Measure actual controls in WebKit as well as Chromium; keep native semantics while styling adequate targets. Wait for route focus/fonts before judging keyboard automation.
- Dismissed suggestions must remain recoverable in mixed added/dismissed lists. Restoring ideas must not remove or duplicate an accepted event.
- After creation, keep the new trip beside its confirmation and provide a direct Open action. Do not attach an unrelated default photo to a new manual event.
- Readable breadcrumbs must remain fully scrolled to the current page after fonts or available width change. A style preview needs a return to the last edited control, not repeated manual scrolling.
- Inline pin-update feedback is not proof of an account save. Account map edits must use the shared queue's confirmed-save notification; incomplete responses and failed retries must never retain success-like pin feedback.
- Recipient validation can run on Enter without changing focus. Reveal its complete error above fixed actions on every invalid submission, including repeated attempts with the same text.
- When a parent grid supplies section spacing, remove duplicate PageHead margins before compressing controls. Account section headings should use the shared section scale, while preserving the larger Caveat readability override.
- A carousel's card width and translation step must use the same measured available width. Keep the focus ring inside a clipped viewport; test the first/last loop and resize while on a later card.
- Asynchronous photo-upload errors must reveal the complete error and Retry action above sticky editor controls on desktop as well as phones. A visible alert can still have its recovery action covered.
- A Google Maps access denial must cancel its pending tile timeout. A later timeout must never replace a known access failure with misleading loading-delay copy.
- Suggestions must skip elapsed hours today and earlier trip dates when choosing a default. Preserve manual editing of past events and explain when no upcoming editable slot remains.
- A group-hidden sample idea must not immediately reappear as the same venue in Nearby. Preserve the existing editor-controlled dismissal/recovery path and distinguish it from dismissing a temporary nearby alert.
- Map restoration clarification (November 11, 2026): Dan explicitly requested retaining/restoring Google Maps while the site-wide refinement continues. Distinguish a local referrer denial from a published-site outage. Never present deterministic SDK fixtures as real map imagery or replace the production provider with them.
- Converter jumps must reserve space only for UI that actually stays fixed. The current top bar scrolls away; a120px scroll margin hid the conversion result on short phones.
- The Style editor should have one mobile action bar. Keep menu access to trip navigation and restore the bottom trip navigation on return to a planning screen.

- Concurrent itinerary updates must retain the upstream Calendar default and 7/10/20-day List choices. Return from save/cancel to the originating view and exact day/event; phone paging controls must wrap without shrinking 44px targets.

- Async authentication errors can push the recovery action below a short viewport even without a fixed footer. Reveal the error/action after rendering while preserving keyboard focus; test settled fonts and the entire alert rectangle.
- Keep Previous/range/Next as one wrapping unit for every List page size and final-page range. A44px control check on the first page does not prove the final page remains coherent.
- Native scrollIntoView nearest ignores overlay bars. Check photo-result cards and attribution against the actual editor-action boundary after images decode.
- Calendar editing instructions must follow the current user's permissions for the visible week; a Viewer must not be told to drag or use unavailable Move controls.
- Before treating a sidebar highlight as stale navigation state, inspect aria-current and active classes and move the pointer away. Normal hover styling is not a retained selection.
- Local Maps setup correction (November 11, 2026): Dan directed checking Ivy's original GitHub configuration. PR1 documents http://127.0.0.1:5190/*; real Maps works there while other review ports receive RefererNotAllowedMapError. Use the configured origin before requesting Cloud access or changing restrictions. Dev/preview default to5190 with strictPort to prevent silent port fallback; isolated mocked tests may still override their port.

- Keep discrete spending labels and responses in the same category column; a continuous scale line can imply intermediate values that the app does not collect. Preserve full-name access and 44px response targets.
- Dense calendar details must be available to both pointer and keyboard users without adding idle clutter. Keep one dismissible, hoverable, viewport-bounded preview and preserve exact-minute drag/Move behavior.

- Disabling an asynchronous action can move focus to BODY. After failure, restore the correction or Retry control only when focus was lost; preserve any control the traveler deliberately focused while waiting.

- Pending destination lookups must say Finding time zone; reserve unavailable for a completed unsuccessful lookup or a previously unresolved saved destination. Template descriptions must reflect which edits are available before versus after creating a trip.
- Keep repeated connection buttons identifiable by provider in their accessible names. Modal section navigation should stay outside the scrolling body when it controls a long index; verify which controls actually disappear before changing the header.
- Browser test evidence belongs in Playwright per-test output paths, not machine-specific or shared review directories, so concurrent projects cannot overwrite each other.

- Live provider checks can reveal behavior absent from SDK fixtures. Google Maps colorScheme is constructor-only; resolve the app/device scheme explicitly and preserve camera, selection and focus when rebuilding. Defer reconstruction during an active pin draft until Save or Cancel.
- Moving an event across days can replace its original DOM opener. Restore focus to the newly rendered event in its destination week, and ignore a stale native close event if the dialog has already reopened.
- A partially visible breadcrumb can remain clipped after focus. Center the focused ancestor and preserve it through font/resize updates; otherwise reveal the current page.
- Nearby preview navigation must not silently dismiss the offer. State the destination of its map action truthfully, and never invent coordinates for a fictional venue.

- Safari pointer clicks can focus a control's focusable ancestor. When restoring focus after a deferred map rebuild, recognize the unchanged completion origin, preserve a later deliberate focus move, and reveal the restored control above actual visible navigation.
- A focused element intersecting the viewport can still be covered by a fixed bar. Assert complete control bounds above that bar after cross-day calendar Move and pin Save/Cancel, including a viewport resize while the dialog is open. Hidden desktop bars are not viewport boundaries.
- Keep destination regions beside their own city and render time-zone rows in destination order; grouping nonadjacent destinations by time zone can silently contradict that order.
- URL.pathname retains escaped spaces in local file URLs. Use fileURLToPath for generated evidence paths instead of creating a percent-encoded sibling directory.

- After saving an expense, reveal its ledger row and preserve any category filter that still includes it; do not leave a successful save offscreen beneath Sample tools.
- Repeated identical async survey failures need a per-attempt reveal trigger; editing or validation should not retrigger that recovery scroll. Keep narrow actions readable and allow320px wrapping.
- Contextual preview shortcuts should disappear when their destination is visible without changing observed layout height or removing the currently focused control.

- Time-zone failure guidance must match the fallback control actually present: secondary lookup failures do not require selecting a new primary calendar zone. Retire warnings when the unresolved destination is removed.
- Keep long-list search outside the modal’s scrolling body, and make prototype section navigation consistent at every width.
- Repeated sample actions must replace obsolete inline feedback. Scope confirmed trip-write notifications so they cannot be mistaken for account/style success.
- Cancel prompts should protect actual edits, including date-only drafts, without prompting on untouched existing forms. Device display preferences can persist locally with safe fallbacks when storage is denied.
- A reopened map chooser needs its complete Close control inside the visible viewport, not merely DOM focus.

- Resolve destination time zones independently: one rejected lookup must not discard successful primary/secondary results or force a known primary zone into a manual fallback. Preserve destination order and guard aborted requests.
- Keep account field validation persistent and associated with each input. Focus the first invalid field after hints render; retain different login versus signup password rules and clear stale hints when changing mode.
- Selected control text and background must change together; animating only the background can briefly make its new text invisible. Neutral decorative tiles must follow both light and dark tones.
- Confirm irreversible repayment effects before applying them. Do not invent a recorded completion date or promise undo when the persisted model only records settled participants.
- Empty shared collections still need context when the item a traveler was viewing disappears. Preserve removed-item recovery for the final item as well as when other items remain.
- Changing itinerary page size must retain the viewed day within the new grouping. Day8 can correctly move into Days1–10; focus its heading rather than assuming the range label alone proves a reset.
- Sample transaction results need the same visible outcome as manual expense saves: reveal the removed confirmation after Undo, or the retained row after Keep/Close, after modal focus restoration.
- Definition-list values may wrap, but fixed labels such as Email must not shrink into broken words beside long addresses.
- When a first-save action disappears, focus its replacement control after the dialog closes instead of leaving keyboard users at the document root.
- Styled confirmations must preserve the original cancellation and persistence semantics. Closing by Escape, X, backdrop or Keep must retain drafts; revalidate a shared removal target and permissions while a nonblocking confirmation is open.
- A backdrop mousedown default can overwrite restored focus after its dialog disappears. Prevent that default only on the backdrop; explicitly focus confirmation openers in Safari before opening.
- Photo-only changes are unsaved event changes too; include selected/uploaded photo state in the discard guard.
- An explicit named demo-entry action must use that participant while preserving saved local work. A normal refresh should retain a deliberately selected fictional participant.
- Focus-only controls need light/dark contrast checks too. Skip links must pair theme foreground and surface tokens rather than a fixed white background.
- When a shared event moves, replace its daily-view URL with the displayed date without adding a Back step. Otherwise later deletion or reload can recover to the stale original day.
- Canonicalizing the date of the same shared event is not new navigation. Keep deliberate keyboard focus in place; reserve item autofocus for opening a different item or returning from another screen.
- A short-phone converter should expose its refresh action beside the result. Keep a visible label,44px target and a separate live-status region; preserve rate dates, warnings and long-value wrapping.
- Long invitation identities must wrap inside the Continue action without shrinking or hiding the email; preserve the existing wrong-account rejection and switching flow.
- Calendar-disabled dates do not replace submit validation. Enforce a starter itinerary’s minimum duration when copying so no plans are created outside the selected trip dates.
- Typed dates must enforce the calendar’s min/max bounds before emitting changes. Keep an invalid attempted date and its correction message visible instead of navigating and silently falling back to another day.

- Size preference-chart columns from content width after the sidebar, not viewport width alone. Keep category navigation available when tablet charts stack, and preserve Ivy's illustrations and response labels.

- Recovery notices change height with wrapped errors and expanded actions. Measure their actual sticky height for itinerary scroll clearance, preserve deliberate focus, and remove the clearance when the notice disappears.

- A specific Nearby idea can open the existing scheduling form directly when an editable future hour exists. Reuse the same availability rule as Suggestions; keep sample cost/duration visible and preserve cancel, permission and no-slot recovery.

- Submitting a typed destination must perform the same timezone lookup as Add. Await unfinished lookups, retain explicit manual fallback choices, and stop late creation if the traveler leaves the form during lookup.
- Do not remove an inline calendar error at drag start: its layout shift changes the time beneath a stationary pointer. Keep it until the new drop resolves.

- Money validation should explain a negative amount with the allowed range, not a decimal-format error. Multi-author note controls should identify a note and count without enumerating the full author list before opening it.

- Persistent recovery belongs in the workspace flow on desktop as well as phone. Branded discard must preserve cancel/focus behavior, recheck pending edits at confirmation, and close if background saving resolves them.

- Focused editing fields must use the actual space between a recovery notice and fixed actions, including after viewport changes. Keep an existing-account shortcut visible on short signup screens without adding a row above the form or changing the logo proportions.

- Trip create/edit needs the same single phone action bar as other editors. Keep header navigation and Cancel, and restore the trip tabs when the form closes.

- Let long reminder text regain row width below its visible actions. Keep map controls opaque over changing provider imagery, explain unavailable Nearby scheduling, and reserve enough width for single-word actions in compact mobile bars.

- A rejected visible date draft must not leave a summary announcing its last accepted value as valid. Keep parent summaries aware of field errors without overwriting the attempted date.
- Check enlarged layouts at short CSS viewports too. Preserve whole action words and44px controls while reducing modal framing so the field and its error remain readable together.
- Seed a new unscheduled event with a free hour; retain explicit or existing times and leave times for manual entry when no planning hour is available. Keep feature success feedback within its relevant return views.
- Reconcile the current hash immediately after subscribing to navigation changes; a deep link or Back action can arrive between initial render and listener setup.

- Service outages should retain account entries and expose an explicit retry beside a useful error. Focus the error for outages, reserve password focus for credential corrections, and preserve deliberately moved focus.
- Invalid date submission should show one inline correction without opening a calendar or native validation bubble over it. Preserve first-invalid focus (query form controls, not invalid fieldsets), submission blocking, and explicit calendar correction.
- Compact empty itinerary rows may combine day metadata, but must keep direct day navigation, date-specific Add actions and viewer permissions intact.

- Short itineraries that already fit the minimum page size need date navigation, not an ineffective page-size selector. Preserve 7/10/20 choices and viewed-day continuity for longer trips.

- Final release direction (November 12, 2026): Dan approved audited repayment correction, then explicitly requested these be the final changes and to push main. Stop further design-score rounds. Finish the current fixes, financial audit implementation and release verification; preserve candid below-target results rather than claiming9.7.
- Audited repayment corrections append status/reason/actor records; server timestamps are authoritative. Keep ever-paid markers and original expense fields, including source provenance, locked. Legacy records must not receive invented dates.

- Animation frames do not prove React committed a regrouped list. Reveal pending targets after their DOM commit and preserve deliberate focus changes during deferred route restoration.

- The expanded 528-case browser matrix needs a ten-minute CI suite budget on two hosted workers; retain the six-minute local budget and every test. A timeout after hundreds of passes is not evidence of a completed release gate.

- After a confirmed deletion closes a modal and removes its opener, restore focus after modal cleanup has removed the background inert state; a frame scheduled from the async handler can run too early.

- Location search reliability (November 12, 2026): independently bound optional geographic bias and each search provider. Test real provider availability as well as fixtures; disabled Places API is not working business autocomplete. Preserve selected place IDs, reject geocoder city substitutions for business names, keep local destination options during outages, and cancel stale requests and dismissed popups.

- Popular Times setup (November 12, 2026): the standard Google Places UI Kit supports an embedded graph, but Ivy manages the Maps project and must enable Places UI Kit there. Preserve API and website restrictions. Load the chart on expansion, keep Google attribution, and distinguish SDK-fixture checks from verified live data. Reveal async retry feedback above the fixed event actions while preserving deliberate focus elsewhere.

- Google setup direction (November 12, 2026): Dan subsequently authorized using team3tripplanner@gmail.com in Chrome and claiming its free trial instead of relying on Ivy's project. He explicitly requires no billing: do not upgrade to pay-as-you-go, prepay, or make a deposit. The Cloud and Supplemental Free Trial terms were accepted with his separate confirmations; signup is pending the user's payment-profile verification, so no trial credit or new API key is confirmed yet.

- No-payment Google option (November 12, 2026): Dan explicitly chose and approved Maps Demo Project terms for Team 3. Created `gmp-demo-project-638434986` and a Maps Demo Key with no payment profile or billing account; the $300 trial was abandoned before verification. Popular Times must use only `VITE_GOOGLE_MAPS_DEMO_API_KEY` in its isolated frame, never fall back to the existing Maps key. Daily limits must stop requests without a paid upgrade. This is solely an educational prototype, not a production deployment. Keep live chart checks distinct from SDK fixtures.

- Replacing a shared control also requires updating existing journey assertions: location-save tests must expect the inline Popular Times disclosure and lazy loading, rather than the removed external Maps link.

- Popular Times layout QA: test app themes that oppose the device theme, not only matching light/dark modes. Override the Google component's default color scheme to inherit the app's scheme and give the frame canvas an explicit matching background. Native time inputs must stack when AM/PM and the picker icon cannot fit side by side.

- Popular Times color direction: graph bars should follow the chosen website accent in every theme and appearance, with readable live labels. Google's weekday selector has a provider-owned neutral background; verify light/dark adaptation and themed text, and do not claim its fill adopts the website hue or patch its closed shadow DOM.

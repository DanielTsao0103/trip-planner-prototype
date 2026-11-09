# Live acceptance: invitations, collaborator preferences and group permissions

**Result: Complete for the three checked sprint cards.** Tested November 8, 2026 (America/Los_Angeles), against the public app with real emails, separate Supabase accounts, independent browser sessions and actual database writes. This closes the live-verification gaps in the earlier five-card report; unrelated unfinished prototype features are excluded.

## Requirements and acceptance evidence

| Requirement | Status | Live evidence |
| --- | --- | --- |
| Invite a new traveler to the correct group | Complete | Owner sent an invitation from the published Group page to a controlled inbox. The email arrived, its real link opened the app's signup flow, and a separate mobile account joined the exact test trip as Viewer. |
| Invite an existing account | Complete | Repeated the real email delivery and acceptance using the now-existing QA account, normal login and the correct trip. No service-role/admin-generated link was substituted for delivery. |
| Require preferences after joining and save them to the database | Complete | Both invite runs opened the preference survey before the itinerary. The traveler saved distinctive notes, the owner's independent client read them from the trip, and a traveler reload retained access/answers. |
| Isolate collaborator preference writes | Complete | A real Viewer saved its own answers while the owner's answers remained unchanged. Attempting to overwrite the owner's preferences was rejected with `42501` and unchanged revision/content. An authenticated write to an unrelated trip was rejected. |
| Enforce Viewer, Editor and Day Editor permissions on the server | Complete | Hosted role suite used actual owner/collaborator SDK sessions. Viewer event edits, self-promotion, owner-save bypass, direct table edits and owner-membership mutation were denied. Editor changes succeeded. Day Editor could edit its assigned date but could not pull/push events across an unauthorized date, delete another day's event, or combine an allowed edit with a forbidden one. |
| Reflect owner role changes in another open browser | Complete | Separate desktop owner and mobile traveler sessions observed promotion and demotion. The Editor saved notes; owner independently read them. The demoted Viewer saw the permission denial. |
| Revoke existing sessions after removal | Complete | Removed an accepted Editor without replacing its session. Trip reads, shared writes and preference writes were denied by the backend. |
| Protect persisted data on invalid/forbidden requests | Complete | The hosted suite independently compared the saved trip and revision after denied writes, checked settled-history protection, retry/idempotency and stale revisions. Denied requests did not partially change records. |
| Responsive role/day dialog and Lighthouse >=90 | Complete | Actual published permission dialog was audited at 1,365 px desktop and 390 px mobile: Lighthouse Accessibility 100 on both; width checks passed. Owner role/day saves survived reload. Login/signup states in this run also scored 100. Earlier live invite/preference page audits scored 100; see linked summaries. |
| Requirements documented, source merged and public deployment | Complete | This report/README and reusable tests are committed to main. The tested public implementation was `7e90c3fde424eb2eed9855a991c3316797f8aee0`; it was already on main and served publicly. No application or database-policy fix was needed for these tests. |

## What ran

1. `scripts/test-live-group-inbox.mjs`: new-account real email → mobile signup → required survey → owner readback → hosted permission suite → two-browser role update/edit/denial → removal. Repeated for the existing-account invitation flow.
2. `scripts/test-live-preference-isolation.mjs`: owner vs real Viewer answer isolation, forbidden owner-answer overwrite and unrelated-trip denial.
3. `AUDIT_ROLE_DIALOG=1 AUDIT_READONLY=1 node scripts/audit-feature-done.mjs`: desktop/mobile Lighthouse, layout, role/day save and reload. This dialog fixture used a fictional guest planner; the authorization checks in steps 1–2 used real separate Auth accounts.
4. Previously recorded current-source regressions: 83 unit and 60 focused browser tests passed. Those were API-mocked/demo regressions and are separate from the new live acceptance evidence.

See [machine-readable evidence](live-group-acceptance-2026-11-08.json). Raw screenshots and logs remain in private workspace outputs. The controlled inbox was provided by [Mail.tm](https://mail.tm/); no personal inbox was accessed. The inbox service temporarily rate-limited reads and one rapid app send was rate-limited; bounded retries respected cooldowns. Both final invitation runs completed successfully.

## Scope, cleanup and retained QA identity

All generated test trips were deleted, including trips from interrupted attempts. The published app's real owner and collaborator sessions only changed their own generated fixtures. No schema, role policy, project setting, existing real trip or real user's credentials were changed. One dedicated disposable collaborator Auth account and its controlled inbox are retained as a repeatable QA identity. Its credentials are stored only in a private untracked `.local.json` file outside the repository; it has no remaining test-trip access. The pre-existing disposable owner account remains unchanged.

Admin dashboard access was unavailable, so these tests used normal app login/signup/invitation and authorized public API flows instead. No administrative credentials were retrieved or required. Removing the retained Auth identity later requires a project administrator; deleting it was not represented as completed.

The tests do not certify every possible provider outage, email client, theme, group size or permission/data combination. Existing minor mobile Account-label and 20-person preference-chart findings remain separate tasks and were not changed by this functional verification.

## Reproduction

The inbox test reads `QA_ACCOUNT_FILE` for an existing disposable owner and uses `QA_COLLABORATOR_FILE` for the controlled test inbox/account. It creates that dedicated identity on the first run, then reuses it. `QA_OUTPUT` selects a private artifact directory. It sends email only to that generated test inbox, deletes its generated trip in `finally`, and retains the test identity for further acceptance runs. The Mail.tm API must be reachable and the app SMTP sender must be configured.

Never commit the private owner/collaborator files, email proof links, inbox tokens or account passwords. The checked-in summaries contain outcome metadata only.

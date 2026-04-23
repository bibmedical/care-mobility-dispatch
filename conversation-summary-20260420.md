# Conversation Summary - 2026-04-20

## Main outcomes

- Fixed the wrong-day SafeRide import behavior caused by unsafe local date handling.
- Root-caused the destructive prune regression that could delete live trips from other days when a partial date-window snapshot was treated as full state.
- Synced TEST with the safer production prune/date behavior across the main client, API, and SQL dispatch-store files.
- Expanded imported mobility and support detection so real Excel values are surfaced more accurately.
- Changed production Trip Dashboard type visibility so the real imported Excel type label shows in the dashboard.
- Cleaned up Trip Update, Cancel Trip, and Send Confirmation modals so they show a readable trip id instead of the long internal imported id.
- Fixed Excel Loader vs Current so Pickup and Dropoff show readable clock times instead of raw Excel serial numbers.
- Recorded the day in the Help/Diarie page and in dated markdown backups for later recovery.

## User goals and requests throughout the day

- User reported that uploaded trips for tomorrow were showing under the wrong date.
- User requested that the fix be uploaded to Render V2/real.
- User asked for the real root cause of destructive prune deleting live trips.
- User asked how to know this would not happen again when deleting trips.
- User required TEST to be fully aligned so local validation matched the real server behavior.
- User asked why production was showing the wrong or duplicate type values from Excel.
- User requested the real Excel type to be shown in production rather than collapsed or duplicated labels.
- User later showed a Trip Update modal with a huge broken-looking string and asked what it was.
- User then showed the Excel Loader vs Current modal with raw values like 46133.32013888889 and asked what that was.
- User asked that the whole day be written into the diary and saved per day.

## Root cause notes

### Wrong-day import bug

- Import parsing could interpret date/time values in a way that drifted across the local day boundary.
- The local tomorrow/date generation path also needed to follow the same local-day rule.
- The fix kept service-date parsing local and stable instead of letting Excel/date conversions shift operational dates.

### Destructive prune bug

- Commit interaction between the admin delete/shrink behavior and active date-window loading allowed a partial snapshot to be treated like the full live dispatch tree.
- That meant trips outside the loaded window could be removed during shrink/prune operations even though they were still valid live trips.
- The repair now scopes trip shrink to the active service-date window and avoids pruning unrelated sections from a partial snapshot.

### Raw trip id in modal

- The ugly text in Trip Update was the internal imported trip id, not a user-facing trip number.
- The import id builder concatenates rideId, tripId, pickup/dropoff times, addresses, destination, and rider into one stable internal id.
- The UI should never expose that raw id directly, so the modal now uses the short display id helper instead.

### Raw Excel numbers in Excel compare modal

- Values like 46133.32013888889 are Excel serial date/time values.
- The compare modal was showing the raw snapshot value from Excel instead of formatting it as a readable time.
- The fix now runs those snapshot values through the same readable time formatting used elsewhere in Trip Dashboard.

## Files that mattered most

### Import and normalization

- `src/helpers/nemt-trip-import.js`
- `src/helpers/nemt-dispatch-state.js`

### Shared client/server dispatch safety

- `src/context/useNemtContext.jsx`
- `src/app/api/nemt/dispatch/route.js`
- `src/server/nemt-dispatch-store.js`

### UI display and modal cleanup

- `src/components/nemt/TripDashboardWorkspace.jsx`
- `src/components/nemt/ConfirmationWorkspace.jsx` was identified as a related area to review for similar raw-id output.

### Diary and recovery notes

- `src/app/(admin)/help/page.jsx`
- `conversation-summary-20260420.md`
- `backup/chat-20260420-render-real-diary-and-dispatch-fixes.md`

## Production commits pushed during this work

- `8c8940c` - Fix local date handling for NEMT imports
- `4307383` - Show real Excel trip types in dashboard
- `0c2556f` - Fix trip modal display ids
- `336a5d2` - Format Excel compare times

## Validation completed

- Repeated editor error checks returned no new errors for the touched files.
- `npm run build` passed in TEST after the modal id cleanup.
- `npm run build` passed in TEST after the Excel compare time formatting fix.
- `npm run build` passed in the clean production deploy worktree before the Render pushes.

## Diary record added

- Added a visible `Diario — April 20, 2026` section to the Help page.
- Added a latest changelog entry for the April 20 dispatch/date/Excel/diary work.
- This file serves as the per-day written conversation summary requested by the user.

## Next likely checks

- Verify Render finished deploying the latest `main` commits.
- Confirm the production Trip Update modal shows readable trip ids.
- Confirm Excel Loader vs Current now shows readable Pickup/Dropoff times.

## 2026-04-22 Twilio consent note

- Confirmed the public V2/login page did not show any visible SMS consent disclosure even though Twilio legal pages had already been added.
- Added a public `SMS Consent Notice` block to the login page so the site now states how riders consent, what messages they receive, that frequency varies, that message/data rates may apply, and that they can reply `STOP` or `HELP`.
- Strengthened the public Terms page wording so `STOP` and `HELP` are visually explicit.
- Validated the change locally with `npm run build` in `clean/web-render-direct` and pushed it to `main` as commit `a2f456b`.

## 2026-04-22 inbound SMS opt-out note

- Confirmed the confirmation send flow already respects `sms.optOutList` before sending, but inbound SMS replies were only parsing confirm/cancel/call actions and were not auto-saving `STOP`-style replies.
- Updated `src/server/sms-confirmation-service.js` so inbound `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`, `REVOKE`, and `OPTOUT` replies are persisted into `sms.optOutList`, matching trips are marked `Opted Out` / `Do Not Confirm`, and the event is logged.
- Validated the change with editor checks and `npm run build` in `clean/web-render-direct`.
- Verified the reported local break was not a dead server: `http://localhost:3015/auth/login` returned `200` and `/api/auth/session` returned valid JSON. The old `clean/web` path no longer exists, so local runs must use `clean/web-render-direct`.

## 2026-04-22 SMS consent-first note

- Added persistent `sms.consentList` and `sms.consentRequestTemplate` fields to integrations storage so the consent roster is kept in `integrations_state` SQL when `DATABASE_URL` exists, with local JSON fallback when it does not.
- Updated the confirmation send flow so patients without granted SMS consent receive the consent-request template first instead of the normal trip confirmation. Those trips move to `Awaiting Consent` / `Needs Consent` until the patient replies.
- Updated inbound SMS handling so `YES`, `Y`, `START`, `UNSTOP`, and `SUBSCRIBE` mark consent as granted, while `STOP`-style replies revoke consent and keep the patient in the do-not-confirm list.

## 2026-04-22 patient profile SQL note

- Confirmed the Confirmation workspace was writing `sms.riderProfiles`, but the backend integrations store was not normalizing or persisting that field.
- Updated `src/server/integrations-store.js` so rider profile records are now preserved in `integrations_state` and therefore saved in SQL for V2 when `DATABASE_URL` exists.
- This keeps patient-specific confirmation rules and exclusion data from being dropped during SMS settings saves.

## 2026-04-22 Render deploy note

- Pushed commit `12e0068` to `main`, which triggered the Render web service `care-mobility-dispatch-web-v2` through `autoDeployTrigger: commit`.
- Verified production health at `/api/health` returned `ok: true` after deploy.
- Verified the production login HTML includes `SMS Consent Notice`, confirming the public consent update is live.
- Verified the production Terms page shows the updated Care Mobility Services LLC SMS language and STOP/HELP wording.

## 2026-04-22 patient contact SQL note

- Updated the Confirmation workspace so `sms.riderProfiles` now preserves patient `name` and `phone` whenever a patient rule, hospital/rehab status, or confirmation profile note is saved.
- Updated `src/server/integrations-store.js` so SQL-backed rider profile normalization preserves those contact fields when writing to `integrations_state`.
- This means V2 now stores patient contact records in SQL as patient profiles, not only exclusion metadata.

## 2026-04-22 live scanner auto-repair note

- Fixed the Trip Dashboard live scanner auto-repair so `same-direction-repeated` findings with two or more trips are repairable again.
- Auto-repair now chooses repair targets by sorting the affected trips by pickup time and leaving the earliest trip intact, instead of blindly inverting trips based on raw finding order.
- This reduces false inversions where the scanner appeared to flip directions on the wrong trip inside a repeated-direction group.

## 2026-04-22 live scanner scope note

- Root-caused a second live scanner issue: the scanner scope included trips marked `Removed Since Last Load`, so active trips and removed trips could be analyzed together as if both were valid repair targets.
- Updated the live scanner scope in Trip Dashboard to analyze only active visible trips, while the removed-trip badge/count remains available separately in the toolbar.
- This prevents scanner findings and auto-repair from treating removed rows as if they were part of the current operational route set.

## 2026-04-22 removed-trip warning restore

- Restored the explicit warning flow for trips that are missing from a later Excel reload: they stay in dispatch, and trips already assigned to a driver remain assigned.
- Trip Dashboard now surfaces those trips separately in both Excel Loader and System Trip Scanner as `Removed Since Last Load` warnings, without feeding them back into direction auto-repair.
- This keeps the original operational behavior: missing-from-latest-import is a warning-only state, not a routing repair target.

## 2026-04-22 conservative auto-repair safeguard

- Tightened Trip Dashboard live scanner auto-repair so it only inverts unambiguous two-leg repeated-direction pairs.
- If a repeated-direction warning is part of a larger or ambiguous group, the scanner now leaves it for manual review instead of inverting directions automatically.
- This is intended to stop broad accidental inversions when the scanner sees warnings that are not clearly a simple outbound/return mismatch.

## 2026-04-22 duplicate import root cause

- Confirmed a separate root cause for bad scanner behavior: repeated Excel loads could duplicate trips when the file did not provide a real `rideId`.
- The parser was generating a fallback `rideId` with `Date.now()`, which changed on every import and polluted the import fingerprint, so the same trip could be treated as new on the next load.
- Removed that unstable fallback so repeated imports without a native `rideId` keep stable matching keys instead of creating duplicate trips.

## 2026-04-22 map provider cleanup

- Switched the effective default tile provider to the existing free OpenStreetMap config.
- Removed visible `Mapbox` selection from Trip Dashboard and Map Screen so the UI no longer advertises or prefers it.
- If an old saved preference still says `mapbox`, the client now rewrites it to `openstreetmap`.

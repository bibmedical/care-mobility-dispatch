# Backup Conversation Record - 2026-04-20

This backup preserves the full-day written context for the April 20 dispatch repair session.

## What the user reported

- Trips imported for tomorrow were showing under the wrong date.
- A destructive delete/prune issue had already happened before and the user wanted the real cause.
- TEST needed to be fully corrected before more production uploads.
- Production type visibility from Excel was wrong or duplicated.
- A Trip Update modal was showing a giant internal id string.
- Excel Loader vs Current was showing raw Excel values instead of readable times.
- The user requested that the whole day be written into the diary and preserved by date.

## What was repaired

1. Import-date handling was corrected so future-day uploads stop landing under the wrong service date.
2. Scoped prune protection was put in place so partial date-window snapshots do not delete unrelated live trips.
3. TEST was aligned with the safer production client/server dispatch behavior.
4. Imported Excel type visibility was improved so the dashboard shows the real imported type label.
5. Mobility/support detection was broadened across imported fields, including WCV and service-animal signals.
6. Trip modals were cleaned up to show readable trip ids instead of the internal concatenated import id.
7. Excel compare Pickup/Dropoff values now format raw Excel serials into readable clock times.
8. The Help/Diarie page now contains a dated April 20 diary block and a latest changelog entry.

## Deploy record

The following validated commits were pushed to `origin/main` during this day of work:

- `8c8940c`
- `4307383`
- `0c2556f`
- `336a5d2`

Render real should auto-deploy from those pushes because production follows `main`.

## Important explanation kept for future recovery

### Why the raw modal text looked broken

It was not random corruption. The modal was exposing the imported internal trip id created from multiple fields so the import could stay stable across rows.

### Why the Excel compare screen showed long decimals

Those were Excel serial date/time values. The compare screen was showing raw snapshot data instead of a formatted time string.

### Why prune became dangerous

The main safety lesson is permanent: a window-scoped client snapshot must never be treated as a global authoritative state when shrink/delete behavior is active.

## Files holding today’s record

- `src/app/(admin)/help/page.jsx`
- `conversation-summary-20260420.md`
- `backup/chat-20260420-render-real-diary-and-dispatch-fixes.md`

This backup exists so the next session can recover the day quickly even if chat context is lost.

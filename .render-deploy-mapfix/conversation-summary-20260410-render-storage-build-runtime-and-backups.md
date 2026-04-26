# Render Storage Build vs Runtime Backup Summary

Date: 2026-04-10

## Problem

- Render service settings show `STORAGE_ROOT=/var/data/care-mobility/storage`.
- Render persistent disk mount path is `/var/data/care-mobility`.
- Logs had shown storage initializing under `/opt/render/project/src/storage`, creating risk and confusion around ephemeral writes.

## Root Cause

- Several server modules resolved storage paths at import time.
- `next build` can touch those imports before runtime mount conditions match the deployed service.
- That produced misleading storage logs during build and made the runtime look broken even when service config was correct.

## Fixes Applied

### Storage root resolution

Updated `src/server/storage-paths.js` to prefer:

1. `STORAGE_ROOT`
2. `/var/data/care-mobility/storage` on Render
3. `/var/data/care-mobility` on Render
4. local fallback `process.cwd()/storage`

Added:

- `Source` logging
- build-aware warning message: `Build-time fallback detected. Runtime may still use the persistent disk when the service starts.`

### Lazy storage initialization

Updated these modules to stop resolving storage at import time:

- `src/server/assistant-knowledge-store.js`
- `src/server/driver-discipline-store.js`
- `src/server/nemt-admin-store.js`
- `src/server/nemt-dispatch-store.js`
- `src/server/system-messages-store.js`
- `src/server/system-users-store.js`

### Render config alignment

Updated `render.yaml`:

- disk size changed from `5` to `50`
- `STORAGE_ROOT` remains `/var/data/care-mobility/storage`

## Validation

- `npm run build` succeeds.
- Build logs now report build-time fallback instead of falsely reporting runtime data loss.

## Backup Status Verified

### File-backed JSON data

- Snapshot backups exist in code.
- `src/server/storage-backup.js` writes snapshots to:
  - `storage/backups/<backupName>/YYYYMMDD-HHmm.json`
  - `storage/backups/<backupName>/latest.json`
- Default retention is `1008` snapshots.

### SQL / PostgreSQL

- SQL persistence exists through PostgreSQL via `DATABASE_URL` in `src/server/db.js`.
- No repo-level automatic SQL dump or `pg_dump` backup process was found.
- Because of that, SQL backup coverage on Render cannot be confirmed from this repo alone.

## Safe Conclusion

- File-based fallback data has snapshot backup logic.
- SQL data is persisted in PostgreSQL.
- Automatic Render Postgres backups are not proven by this codebase and must be verified in Render database settings.

## Expected Runtime Log After Deploy

- `Initialized: /var/data/care-mobility/storage`
- `Source: STORAGE_ROOT`
- `Persistent disk: YES (Render)`
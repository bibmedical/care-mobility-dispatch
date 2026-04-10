# Render Storage Build vs Runtime Backup Summary

Date: 2026-04-10

## Problem

- Render showed `STORAGE_ROOT=/var/data/care-mobility/storage` configured in service settings.
- Render disk mount path was confirmed as `/var/data/care-mobility`.
- Logs previously showed storage initializing at `/opt/render/project/src/storage` and warning about ephemeral storage.
- Risk: another change or another chat could incorrectly force writes back to the ephemeral project filesystem.

## Root Cause Found

- The app already supported `STORAGE_ROOT`, but several server modules resolved storage paths at import time.
- During `next build`, those imports can run before the runtime environment matches the deployed web service mount state.
- That caused misleading storage initialization logs during build and made it easy to misdiagnose runtime persistence.

## Fix Applied

### 1. Hardened storage root selection

File: `src/server/storage-paths.js`

- Resolution order now prefers:
  1. `process.env.STORAGE_ROOT`
  2. `/var/data/care-mobility/storage` when running on Render
  3. `/var/data/care-mobility` when running on Render
  4. local fallback `process.cwd()/storage`
- Added log source reporting.
- Added build-aware warning so `next build` logs say `Build-time fallback detected` instead of falsely implying runtime data loss.

### 2. Removed eager storage initialization from server modules

Files updated:

- `src/server/assistant-knowledge-store.js`
- `src/server/driver-discipline-store.js`
- `src/server/nemt-admin-store.js`
- `src/server/nemt-dispatch-store.js`
- `src/server/system-messages-store.js`
- `src/server/system-users-store.js`

Change:

- Replaced top-level `getStorageRoot()` / `getStorageFilePath()` constants with lazy helper functions so storage is resolved only when actually used.

### 3. Render infrastructure file aligned

File: `render.yaml`

- Persistent disk size updated from `5` to `50` to match the actual Render setup shown in screenshots.
- `STORAGE_ROOT` remains `/var/data/care-mobility/storage`.

## Validation

- `npm run build` succeeds.
- Build logs now show:
  - local fallback during build on local machine
  - explicit message: `Build-time fallback detected. Runtime may still use the persistent disk when the service starts.`
- No file errors remained after edits.

## Backup Status Verified From Code

### File-based storage backups

- Yes, file-based JSON persistence has snapshot backups.
- `src/server/storage-backup.js` writes versioned snapshots under:
  - `storage/backups/<backupName>/YYYYMMDD-HHmm.json`
  - `storage/backups/<backupName>/latest.json`
- Retention count defaults to `1008` snapshots.
- This covers file-backed fallback stores that use `writeJsonFileWithSnapshots(...)`.

### SQL / PostgreSQL

- The app uses PostgreSQL through `src/server/db.js` and `DATABASE_URL`.
- Confirmed from code: the app depends on Render environment `DATABASE_URL` for SQL.
- Not confirmed from repo: an automated SQL dump or `pg_dump` backup job for the Render database.
- No repo-level automated Postgres backup/export process was found for production SQL.

## What Is Safe To Say

- There is code-level backup coverage for file-backed JSON stores on persistent disk.
- There is SQL persistence through PostgreSQL.
- There is not enough evidence in this repo alone to claim that Render Postgres backups are configured or recoverable beyond Render's own platform defaults/settings.

## Recommended Runtime Check After Deploy

Expected startup logs on Render web service should show one of these:

- `Initialized: /var/data/care-mobility/storage`
- `Source: STORAGE_ROOT`
- `Persistent disk: YES (Render)`

If runtime still shows `/opt/render/project/src/storage`, the deployed service env or mount is not being applied to the running web process and must be fixed in Render service configuration.
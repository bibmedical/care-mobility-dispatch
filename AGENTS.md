# AGENTS.md

## Scope

These instructions apply to the whole workspace.

## Workspace Map

- Root app: Next.js 15 web admin and dispatch system.
- `driver-app/`: separate Expo mobile app for drivers.
- `render-live/`: deploy-aligned local mirror/reference copy.
- `backup/`: dated continuity notes and recovery material from prior sessions.
- `scripts/`: operational scripts such as SQL backup merge and local auth reset.
- `storage/`: local-development storage only; production state should come from PostgreSQL.

## Non-Negotiable Separation

- Treat the root app and `driver-app/` as separate products.
- Deploy only the root app to Render.
- Build and ship `driver-app/` with Expo / EAS, not Render.
- Do not mix unrelated web and Expo edits in the same change unless the task truly spans both.

See [README.md](README.md), [render-live/README.md](render-live/README.md), and [driver-app/README.md](driver-app/README.md).

## Preferred Workflow

- Start with the smallest local surface that controls the behavior.
- Validate locally first, then consider Render or EAS work.
- Prefer focused checks over broad repo-wide changes.
- Preserve existing deploy and recovery notes; add new continuity notes instead of overwriting history.

## Context Continuity

- Before asking the user to restate prior work, read the newest relevant `conversation-summary-*.md` file in the workspace root.
- If the root summary is insufficient, check matching notes under `backup/`.
- For communication or driver-messaging work, read [COMMUNICATION_QUICK_START.md](COMMUNICATION_QUICK_START.md) first, then [EXTENSIONS_README.md](EXTENSIONS_README.md) for technical details.
- When reporting deploy or rollout state, include the deploy identifier or commit when it is known.

Useful starting points:

- [conversation-summary-20260418-render-ny-time-fix-apk-local-sync.md](conversation-summary-20260418-render-ny-time-fix-apk-local-sync.md)
- [README.md](README.md)
- [TODO.md](TODO.md)

## Validation Commands

Root web app:

```bash
npm run dev
npm run build
npm run lint
npm run start
```

Driver app:

```bash
cd driver-app
npm start
npx eas build --platform android --profile preview --non-interactive
```

Use the existing VS Code tasks for Expo start variants when available.

## Deploy and Runtime Notes

- Render config lives in [render.yaml](render.yaml).
- The production web service is `care-mobility-dispatch-web-v2`.
- Render should serve the root app only and uses `/api/health` as the health check.
- Production persistence is expected to come from PostgreSQL, not local JSON files.
- Avoid introducing new production assumptions that depend on local filesystem state.

## Change Safety

- Do not make blind fixes. Check the relevant README, continuity note, or operating doc first.
- Keep deploy-facing changes minimal and easy to validate.
- If a task touches communication, auth, storage, or deploy behavior, call out assumptions explicitly in your final report.
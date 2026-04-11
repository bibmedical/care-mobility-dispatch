# Backup - 2026-04-10 - Web Auth English + Deploy Prep

## User Request
- Keep all login/auth messaging in English.
- Create backup and conversation summary before uploading.

## Completed Changes
- Reverted recent Spanish text back to English in the web login flow while preserving security logic:
  - Required first-time 6-digit web code setup (`web-pin-setup`).
  - Required 6-digit web code verification for returning users (`web-pin`).
  - Single active web session guard remains server-enforced.

## Files Updated
- `src/app/(other)/auth/login/useSignIn.js`
- `src/app/(other)/auth/login/components/LoginForm.jsx`
- `src/app/api/auth/pre-login/route.js`
- `src/app/api/auth/2fa/login-verify/route.js`
- `src/app/api/auth/web-code/setup/route.js`

## Notes
- There are unrelated untracked assets in the repository that were not included in this auth change.

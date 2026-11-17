# ChấmPro web sync — main integration staging gate (2026-11-17)

Status: **NOT DEPLOYED, NOT ENABLED**. This branch starts from current `main` so published GitHub Pages stays untouched.

## Confirmed by live operator checks
- Pages: `main / (root)`, custom domain `champro.mrhien.com`, HTTPS enabled.
- Live `/app/web-app-sync.mjs` returns GitHub Pages 404; `main/app/index.html` does not load it.
- `champro-sync-staging` Worker `/health` responds OK; `/api/sync/status` responds 503 (`CHAMPRO_SYNC_ENABLED=0`).
- Bindings: D1 `DB=champro-platform-staging`, R2 `BUCKET=champro-photos-staging`; HMAC secret present (equality with WP not yet proven).
- D1: 6 active account rows, all IDs match `wp:<wp_user_id>`; `sync_records=0`, `sync_photos=0`.
- WordPress `/wp-json/champro/sync/v1/web-token` with no platform JWT responds 401, not proof of an authenticated sync token.
- D1 SQL export read back in SQLite RAM; R2 two objects locally downloaded; two MySQL dumps gzip-checked; WP plugins/themes backup TAR read successfully; WP uploads backup TAR reads 3787 paths. These are locally held by user, **NOT** complete recovery drills for all services.
- Latest WordPress backup may postdate the selected 2026-11-15 plugin archive; production WordPress state must be checked before modifications.

## Confirmed repository compatibility blockers
1. `main/app/app.mjs` stores legacy data under `champro-web-beta-v1`; the feature PR's `app-preview/app.mjs` uses `champro-app-preview-v1`. Replacing the live app would hide users' existing local grades.
2. `main/app/app.mjs` lacks `window.champroAppData` (`getDb/applySyncDb/isCameraBusy`); `app-preview/web-app-sync.mjs` requires it.
3. `main/platform/licensing/auth-session.js` only exposes `getToken,save,clear`, **not** `getAccount`. `app-preview/web-app-sync.mjs` checks `getAccount()?.id` and will not run when copied unchanged. Must adapt verified account lookup safely without trusting client claims.
4. Feature PR #35 has target base `fix/champro-server-woocommerce-entitlement-v054-20261116` and is a draft; DO NOT merge it into main directly.
5. `main/app` is not identical to `app-preview`; copy neither page nor OMR/grader modules wholesale. Preserve all existing camera, score, photo review, licensing and payment functions.
6. Existing Android v14.7.4 real package content, signing key, and local data compatibility have NOT been independently tested against this integration.
7. This GitHub CI only covers synthetic tests. A green check is **not** proof of actual web ↔ APK or offline reconnection.

## Safe implementation + verification criteria
- Separate additive module(s) in `app/`, no data key migration, no camera/grading loop changes; `CHAMPRO_SYNC_ENABLED=0` throughout development.
- Explicit per-account ownership confirmation for historical browser data, full non-destructive backup before first upload; no automatic cross-account import.
- Web session must derive owner from server-verifiable platform JWT plus a validated `/api/me` response, not from unverified localStorage/account name.
- First run read-only authenticated status with synthetic identity, then scoped synthetic CRUD and JPEG in staging. Verify signed token and two accounts fully isolated, wrong/expired tokens rejected.
- Test live two-device offline reconnection, edited answer keys, score changes, student roster, image checksum and metadata; conflict handling must not overwrite.
- Test offline speed with real Android v14.7.4 separately, and preserve no-logout behavior offline.
- Keep all production Pages and Cloudflare flags unchanged until a separately reviewed integration is safe and user explicitly approves deployment.

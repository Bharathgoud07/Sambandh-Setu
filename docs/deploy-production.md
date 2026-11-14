# Production deployment — Node API + Setu Guide (D3-12)

Owner: Aditya (DevOps 1). Updated: 2026-11-14.
No secret values belong in this file. Env names are in
`docs/env/production-env.md`; values live in the host environment.

> **Free-only policy:** no paid plan, paid add-on, paid static IP or paid
> backup tier. If a free-tier limit blocks launch, escalate to the lead; never
> purchase or click a paid upgrade.

## 0. Preconditions

- [ ] Day 1/2 PRs merged into `dev` (backend #1–#6, guide #44–#47).
- [ ] `dev` CI green for backend and guide.
- [ ] Production Atlas project/cluster/user created (D3-11; already done).
- [ ] Production values generated and stored outside the repo
      (`C:\Users\adity\.setu-secrets\prod\`).
- [ ] Render free capacity accepted (2 staging + 2 production services exceed
      the ~750 h/month free allowance). Decide what may sleep; **do not
      upgrade**.
- [ ] Sentry DSN and Slack/Discord webhook available (D2-23 / D3-14).

> Render access is required. This workstation has no Render API token, so the
> service creation and env-var paste steps below are the only blocked part.

## 1. Production URLs (proposed)

| Service | URL |
|---|---|
| Node API | `https://sambandh-setu-api-prod.onrender.com` |
| Setu Guide | `https://setu-guide-prod.onrender.com` |

Create the services with these names so the URLs match. Tell Ankit and Pooja
as soon as both respond.

## 2. Node API — Render Web Service

1. Render → **New +** → **Web Service** → repository
   `Bharathgoud07/Sambandh-Setu`.
2. Branch: `dev` (after the PRs merge).
3. Runtime: **Docker**. Dockerfile path: `./Dockerfile`; context: `.`.
4. Name: `sambandh-setu-api-prod`. Region: **Singapore**. Plan: **Free**
   (paid plans are not approved).
5. Health check path: `/health`.
6. Environment → add (values from the secure files, never from chat):
   - `NODE_ENV=production`
   - `MONGODB_URI` → `C:\Users\adity\.setu-secrets\prod\mongodb-uri.txt`
   - `JWT_SECRET` → `C:\Users\adity\.setu-secrets\prod\jwt-secret.txt`
   - `GUIDE_SERVICE_URL` → the production Guide URL (no trailing slash)
   - `SENTRY_DSN` (optional until D2-23 is unblocked)
   - `CORS_ORIGINS` once Ankit's allow-list lands
7. **Manual Deploy** → wait for **Live**. `GET /health` must return
   `{"data":{"status":"ready"}}`.

Dockerfile behavior: exposes `PORT` default 5000, runs as non-root, health
probe uses `/health`.

## 3. Setu Guide — Render Web Service

Use Render's **native Python** runtime (staging uses native Python; the
repository Dockerfile hardcodes port 8000 and does not bind Render's `$PORT`).

1. Render → **New +** → **Web Service** → repository `ujala100/setu-guide`.
2. Branch: `dev`.
3. Runtime: **Python**. Build command:
   `pip install -r requirements.txt`.
4. Start command:
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Name: `setu-guide-prod`. Region: **Singapore**. Plan: **Free** plus a
   keep-warm monitor; a paid always-on instance is not approved.
6. Health check path: `/health`.
7. Environment:
   - `PYTHON_VERSION=3.11.9`
   - `USE_MOCK=true` (template fallback; no vendor key needed)
   - `LLM_PROVIDER=placeholder`
   - `LLM_TIMEOUT_SECONDS=10`
   - `RATE_LIMIT_PER_USER=30/minute`
   - `RATE_LIMIT_PER_IP=60/minute`
   - `TRUSTED_PROXY=false`
   - `CACHE_ENABLED=true`, `CACHE_TTL_SECONDS=600`, `CACHE_MAX_ITEMS=500`
   - `LOG_LEVEL=INFO`
   - `LLM_API_KEY` only if `USE_MOCK=false` (new key)
8. **Manual Deploy** → wait for **Live**. `GET /health` must return
   `{"status":"ok"}`.

If you must use the Docker image instead, change the runtime CMD to bind
`$PORT` (e.g. `sh -c "uvicorn app.main:app --host 0.0.0.0 --port $PORT"`);
otherwise Render cannot route traffic.

## 4. Wire the two services

1. Copy the Guide production URL into the Node service's
   `GUIDE_SERVICE_URL`, then **Manual Deploy** the Node service.
2. Set the frontend `EXPO_PUBLIC_API_URL` to the Node production URL (Ankit,
   D3-18) and rebuild the release.
3. Publish the production URLs in the team channel for Ankit/Pooja.

## 5. Smoke test

Windows:

```powershell
powershell -File scripts/smoke-test.ps1 --base-url https://sambandh-setu-api-prod.onrender.com --guide-url https://setu-guide-prod.onrender.com
```

Git Bash / Linux:

```bash
scripts/smoke-test.sh --base-url https://sambandh-setu-api-prod.onrender.com --guide-url https://setu-guide-prod.onrender.com
```

Checks (all synthetic data):

1. `/health` 200 with DB `ready`.
2. Helmet-style security headers (`x-content-type-options: nosniff` + CSP /
   frame / HSTS).
3. CORS does not echo a random origin.
4. Auth rate limit returns **429** with `error.code`.
5. OTP request endpoint responds 2xx.
6. Node `/guide/chat` returns a reply or `fallback: true`.
7. Guide `/health` answers in under 5 s on the first call.
8. `/me`, `/connections`, `/chats` refuse unauthenticated access (401/403).

`SMOKE_TOKEN` is required for check 6. Production `NODE_ENV=production`
disables `/auth/dev-login`, so use a short-lived **synthetic** token from an
approved test account (never a real pilot's token). Export it without putting
it in shell history:

```powershell
$env:SMOKE_TOKEN = (Get-Content "C:\Users\adity\.setu-secrets\prod\smoke-token.txt" -Raw).Trim()
```

`--allow-skips` is for local dry runs only; a production run with skips is a
failure.

### Current expected failures (until owner PRs merge)

Against staging today the smoke test correctly reports:

- security headers missing (Ankit: Helmet);
- CORS `*` (Ankit: allow-list);
- OTP + rate limit 404 (`/auth/send-otp` not implemented);
- `/guide/chat` skipped/failed (Sakshi: route not implemented).

Do not mark D3-12 done until all eight checks pass.

## 6. Rollback

1. Render → service → **Deploys** → select the previous successful deploy →
   **Rollback**.
2. If the failure is configuration-only, revert the env var and redeploy.
3. If the DB is affected, follow `docs/runbooks/backup-restore.md` (staging
   drill) adapted to the production cluster; never restore over production
   without the lead's approval.
4. Announce the rollback and the reason in the team channel.

## 7. Production risks

- **Network access:** Atlas production is open to `0.0.0.0/0` because Render
  free egress has no static IP. Static egress/private endpoints are paid and
  **not approved**; keep the strong DB password/TLS and revisit only with
  company budget approval.
- **Backups:** M0 has no Cloud Backup/PITR (`backupEnabled=false`). An M10+
  upgrade is paid and **not approved**; take a manual `mongodump` before launch
  and document the schedule/restore drill.
- **Guide cold start:** free instances sleep; the 5-minute keep-warm monitor is
  required. Paid always-on is not approved. If the 750 h/month free capacity is
  exhausted, escalate to the lead — do not upgrade.
- **Secrets:** production `JWT_SECRET`, DB password and any LLM key are new
  values; never reuse staging/dev.

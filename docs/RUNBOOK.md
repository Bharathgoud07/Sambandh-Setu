# Setu launch runbook

Owner: Aditya (DevOps 1). Version: 1.0 (draft until production smoke passes).
Updated: 2026-11-14.

> **Launch-day status (2026-11-14):** staging is live; the production Atlas
> cluster exists; the production Render services, OTP flow, security middleware
> and `/guide/chat` are **not live yet**. This runbook is usable now for
> staging and becomes the production source of truth once those land.
>
> **No secret values belong in this file.** Env names only. Values live in the
> host secret store or `C:\Users\adity\.setu-secrets\` (outside git).

Companion documents (merge with the D3 PRs):

- `docs/env/production-env.md` — production env names and isolation proof.
- `docs/deploy-production.md` — exact Render production steps.
- `docs/deploy-staging.md` — staging deploy (D2-21).
- `docs/runbooks/backup-restore.md` — staging restore drill (D2-25).
- `docs/runbooks/prod-alerts-backups.md` — production alert/backup checklist
  (D3-14).
- `docs/observability/error-tracking.md` — optional Sentry setup (D2-23).

## 1. Service map

| Layer | Technology | Repository | Staging | Production | Owner |
|---|---|---|---|---|---|
| Mobile/web app | Expo React Native | `karanpandeyklk/Setu_app` | `https://setu-app-ten.vercel.app` (web) | release build pending | Karan |
| Node API | Express + Mongoose | `Bharathgoud07/Sambandh-Setu` | `https://sambandh-setu-backend.onrender.com` | `https://sambandh-setu-api-prod.onrender.com` (proposed) | Bharath / Sakshi |
| Setu Guide | FastAPI | `ujala100/setu-guide` | `https://setu-guide-1wiy.onrender.com` | `https://setu-guide-prod.onrender.com` (proposed) | Ujala |
| Primary DB | MongoDB Atlas | — | `setu-staging`, M0 | `setu-production`, M0 | Aditya |
| Web/waitlist | static/Vercel | — | pending | pending | Pooja |
| Monitoring | UptimeRobot | — | Node `804664536`, Guide `804661990` | create in D3-14 | Aditya |
| Errors | Sentry (optional) | — | pending DSN | pending DSN | Ankit |

Request path:

```text
Expo app / web
      |
      | HTTPS  EXPO_PUBLIC_API_URL
      v
Node API (Render, Docker)  --->  MongoDB Atlas (separate prod cluster)
      |
      | HTTPS  GUIDE_SERVICE_URL
      v
Setu Guide (Render, native Python)  --->  LLM provider (only when USE_MOCK=false)
      |
      +--> template fallback when the provider is unavailable
```

The Node API is the only service the app talks to. The Guide is internal; the
app never calls it directly. Node's `POST /guide/chat` proxy is **not
implemented yet** (Sakshi). Until it exists, the Guide is reachable only by
direct `/health` checks.

## 2. Environments and isolation

| Item | Local | Staging | Production |
|---|---|---|---|
| Node URL | `http://localhost:5000` | `https://sambandh-setu-backend.onrender.com` | proposed `https://sambandh-setu-api-prod.onrender.com` |
| Guide URL | `http://localhost:8000` | `https://setu-guide-1wiy.onrender.com` | proposed `https://setu-guide-prod.onrender.com` |
| Atlas project | local Mongo | `Project 0` (`6af73245bc56668ae12d4704`) | `Setu Production` (`6af7de8d05cbff3cac56c9e5`) |
| Atlas cluster | local | `setu-staging` | `setu-production` (`6af7de987eb8f34eea9760c8`) |
| DB host | `127.0.0.1` | `setu-staging.ujzcbgc.mongodb.net` | `setu-production.7adxz9v.mongodb.net` |
| DB user | local | `setu_staging` | `setu_prod_app` (`readWrite`) |
| Database | `sambandh_setu` | `sambandh_setu` | `sambandh_setu` |
| JWT secret | local test | staging value | **new value** |
| Guide mode | `.env` | host env | `USE_MOCK=true` for launch |
| Sentry env | — | `staging` | `production` |

Rules:

1. Never reuse a staging/dev secret in production. `JWT_SECRET`, the DB
   password inside `MONGODB_URI`, LLM key, Sentry DSN and any email key are
   **new production values**.
2. Run the isolation check before every production deploy:
   `node scripts/check-prod-config.js --prod <prod.env> --staging <staging.env>`.
3. Production Atlas network access is currently `0.0.0.0/0` because Render free
   egress has no static IP. Replace with static egress/private endpoint when
   available.
4. `setu-production` is M0: **Cloud Backup/PITR is disabled**. The launch
   fallback is a manual `mongodump` (section 9).
5. Production `NODE_ENV=production`. This disables `/auth/dev-login`; real
   signup must use the OTP flow.

## 3. Environment variable names (no values)

Source: `setu-guide/docs/env-vars.md` (guide PR #44) + `SENTRY_DSN` (D2-23).
`🔒` = secret; store only in the host environment.

### Node API

| Name | Purpose | Secret |
|---|---|---|
| `NODE_ENV` | runtime mode (`production` on hosts) | no |
| `PORT` | host-assigned HTTP port | no |
| `MONGODB_URI` | Atlas connection string (contains the DB password) | 🔒 |
| `JWT_SECRET` | HS256 session signing, at least 32 chars | 🔒 |
| `GUIDE_SERVICE_URL` | Guide base URL, no trailing slash | no |
| `SENTRY_DSN` | error reporting (optional until D2-23) | 🔒 |
| `CORS_ORIGINS` | browser allow-list (code pending) | no |
| `EMAIL_API_KEY` | OTP/transactional email (Ankit) | 🔒 |
| `INTERNAL_API_KEY` | service-to-service auth if enabled | 🔒 |

### Setu Guide

| Name | Purpose | Secret |
|---|---|---|
| `PYTHON_VERSION` | Render runtime pin (`3.11.9`) | no |
| `USE_MOCK` | `true` = template reply, no vendor call | no |
| `LLM_PROVIDER` | vendor name (`placeholder` while mock) | no |
| `LLM_API_KEY` | required only when `USE_MOCK=false` | 🔒 |
| `LLM_TIMEOUT_SECONDS` | outbound LLM budget (default 10) | no |
| `RATE_LIMIT_PER_USER` | e.g. `30/minute` | no |
| `RATE_LIMIT_PER_IP` | e.g. `60/minute` | no |
| `TRUSTED_PROXY` | `true` only behind a proxy we control | no |
| `CACHE_ENABLED` | response cache | no |
| `CACHE_TTL_SECONDS` | cache TTL | no |
| `CACHE_MAX_ITEMS` | cache size | no |
| `LOG_LEVEL` | `CRITICAL`..`DEBUG` | no |
| `INTERNAL_API_KEY` | inbound service auth if enabled | 🔒 |
| `AUTH_METHOD` | `api_key` or `bearer` (planned) | no |

### Expo frontend

| Name | Purpose | Secret |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Node production URL (bundled, public) | no |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | public OAuth client ID | no |

Frontend release build must contain the **production** Node URL. The current
Vercel bundle still contains `https://REPLACE-WITH-STAGING-URL` and
`USE_MOCK = true`; Karan must rebuild without cache after setting the env.

## 4. Deploy

### 4.1 Preflight

- [ ] PRs for the release are merged into `dev`; CI is green.
- [ ] `node --test` passes in `backend`; guide tests pass.
- [ ] Production env values exist outside git and pass the isolation check.
- [ ] Atlas production cluster is up; DB user and network access work.
- [ ] A recent production manual dump exists (M0) or Cloud Backup is enabled.
- [ ] UptimeRobot monitors are ready to be created.
- [ ] Release owner/lead is available for rollback decisions.

### 4.2 Node API (Render, Docker)

1. Render → **New +** → **Web Service** → `Bharathgoud07/Sambandh-Setu`.
2. Branch `dev`; runtime **Docker**; Dockerfile `./Dockerfile`; context `.`.
3. Name `sambandh-setu-api-prod`; region Singapore; plan Free or paid.
4. Health check `/health`.
5. Add env names from section 3; values from the host secret store.
6. Deploy; wait for **Live**.
7. Verify: `GET /health` → `200 {"data":{"status":"ready"}}`; `/health/live`
   and `/health/ready` also 200.

Full step-by-step: `docs/deploy-production.md`.

### 4.3 Setu Guide (Render, native Python)

1. Render → **New +** → **Web Service** → `ujala100/setu-guide`.
2. Branch `dev`; runtime **Python**.
3. Build `pip install -r requirements.txt`.
4. Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Name `setu-guide-prod`; region Singapore; paid recommended for always-on.
6. Health check `/health`.
7. Env: `USE_MOCK=true`, `LLM_PROVIDER=placeholder`, limits/cache/log values
   from section 3.
8. Deploy; verify `GET /health` → `200 {"status":"ok"}` and first response
   under 5 s.

Do **not** use the repository Dockerfile unchanged: it hardcodes port 8000 and
does not bind Render's `$PORT`. Either use native Python or override the CMD.

### 4.4 Frontend release

1. Set `EXPO_PUBLIC_API_URL` to the production Node URL.
2. Set `USE_MOCK=false` in the API client (real network mode).
3. Rebuild the release **without cache** (EAS/host).
4. Install the signed build on a test device; confirm the bundle contains the
   production URL and does not contain `REPLACE-WITH`.
5. Verify login, OTP, the four Guide quick actions and the safe fallback.

### 4.5 Post-deploy verification

```bash
# full smoke test (no skips in production)
scripts/smoke-test.sh --base-url https://sambandh-setu-api-prod.onrender.com \
  --guide-url https://setu-guide-prod.onrender.com

# Windows
powershell -File scripts/smoke-test.ps1 --base-url ... --guide-url ...

# backup readiness
node scripts/check-prod-backup.js

# production isolation
node scripts/check-prod-config.js --prod <prod.env> --staging <staging.env>
```

All eight smoke checks must pass; `SMOKE_TOKEN` must be a synthetic token, never
a real pilot's token. `--allow-skips` is for local dry runs only.

## 5. Rollback

### 5.1 Node / Guide

1. Render → service → **Deploys** → previous successful deploy → **Rollback**.
2. For a code rollback, revert the merge commit on `dev` and let auto-deploy
   run. Never force-push `dev`/`main`.
3. Re-run `/health` and the smoke test.
4. Announce the rollback, reason and current status in the team channel.

### 5.2 Frontend

1. Re-publish the previous release build / EAS build.
2. If the issue is the API URL, fix the env and rebuild (do not ship a bundle
   pointing at staging).
3. Confirm the installed build uses the production URL.

### 5.3 Database

- There is no automatic DB rollback. Never restore over production without the
  lead's explicit approval.
- If a restore is required: freeze writes, take a pre-restore dump, restore into
  a temporary database, verify, then follow the approved cutover (section 9).
- Record the dump path, restore target, counts and approver.

### 5.4 Communication

Tell the team: what broke, who is affected, what was rolled back, what users
should do, and the next update time. A privacy/secret incident is reported the
same minute (section 8).

## 6. Logs and observability

| Source | Where | Notes |
|---|---|---|
| Node runtime logs | Render → service → **Logs** | request/error logs; no tokens, OTPs, messages or DB URI |
| Guide runtime logs | Render → service → **Logs** | provider failures logged without message/topic/ids/key |
| UptimeRobot | dashboard | 5-minute `/health` checks, alert contact `9033668` |
| Sentry (optional) | Sentry project | 5xx only, PII-free events; no-op without `SENTRY_DSN` |
| Atlas | Atlas → project → cluster | connections, CPU, disk, slow queries, backup state |
| Deploy history | Render → Deploys | who/when/commit; rollback source |

Rules:

- Logs must never contain `MONGODB_URI`, `JWT_SECRET`, `LLM_API_KEY`, OTP codes,
  full chat messages, email addresses or phone numbers. D2-24 fixed the known
  Guide/Node logging leaks; treat any new occurrence as a privacy incident.
- Use the request id/status/latency, not payloads, when debugging.
- If Sentry is enabled, confirm the event has no PII before sharing a link.

## 7. AI outage and Guide fallback

| Mode | Behaviour | When |
|---|---|---|
| `USE_MOCK=true` | Deterministic template replies from the Guide KB; no vendor call | Launch default; vendor outage |
| `USE_MOCK=false` | Calls the configured LLM with `LLM_TIMEOUT_SECONDS` | Only with a valid new `LLM_API_KEY` |

Detection:

1. UptimeRobot Guide monitor is down, or `/health` is not 200.
2. Render logs show timeouts/5xx from the provider.
3. Node `/guide/chat` (once implemented) returns 502/504 or the friendly
   fallback.
4. Users report Guide quick actions not answering.

Response:

1. Confirm the Guide is down (`GET /health`; Render logs).
2. If the vendor is down or the key is invalid, set `USE_MOCK=true` in the
   Guide service and redeploy. This is the safe launch fallback.
3. Verify the four quick actions return template replies and Node returns the
   friendly fallback when the Guide is unreachable.
4. Do not retry-loop; the Guide/Node must fail fast and show a friendly message.
5. Restore `USE_MOCK=false` only after the vendor is stable and the key is
   valid; run a Guide chat check first.
6. Record the outage window, mode used and user impact.

Current gap: Node `/guide/chat` is not implemented, so the app cannot reach the
Guide through the API yet. Do not claim the AI fallback is done until Sakshi's
route lands and the smoke check passes.

## 8. Secret rotation

Generate production JWT/DB values with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-prod-secrets.ps1
```

It writes outside the repo and prints only paths/lengths.

| Secret | Rotate | Update | Impact | Verify |
|---|---|---|---|---|
| `JWT_SECRET` | new 32+ random value | Render Node env | all sessions invalid | `/health`; new login/OTP |
| DB password | Atlas → Database Access → edit `setu_prod_app` → generate | Render `MONGODB_URI` | brief DB auth failures until redeploy | `/health` ready; write/read |
| `LLM_API_KEY` | provider console | Render Guide env | LLM calls fail until redeploy | Guide chat; logs |
| `SENTRY_DSN` | Sentry project key | Render Node env | old events stop | send a test 5xx |
| `EMAIL_API_KEY` | email provider | Render Node env | OTP mail stops until updated | request OTP |
| UptimeRobot API key | UptimeRobot account | local secure file | automation only; monitors keep running | create/list monitor |
| `INTERNAL_API_KEY` | new random value | both services | service calls 401 until both updated | internal call |

Emergency (leak/exposure):

1. Revoke/rotate **first**; do not wait for a convenient window.
2. Check logs for use of the old secret; preserve evidence.
3. Report to the lead/team **the same minute**; never paste the secret in chat,
   PRs, tickets or logs.
4. Update the host env, redeploy, verify, and document the rotation time.

## 9. Atlas backup and restore

### 9.1 Current state

- Production: `setu-production`, M0, `backupEnabled=false`. No Cloud
  Backup/PITR.
- Fallback: manual `mongodump`; RPO = dump interval (up to 24 h), RTO ≈ 10 min
  at current size.
- Staging drill (D2-25): 40 KB dump, 10 collections, 36/36 documents restored,
  temp DB dropped.

### 9.2 Manual backup

Run from an allowed host; never put the URI in shell history or chat.

```bash
mongodump --uri="$MONGODB_URI" \
  --out="/backups/setu-prod-$(date +%F)" --quiet
```

Keep 7 daily + 4 weekly dumps, encrypted, off-cluster. A dump contains user
profile data: treat it as sensitive.

### 9.3 Restore drill / recovery

Always restore into a **temporary database** first:

```bash
mongorestore --uri="$MONGODB_URI" \
  --nsInclude="sambandh_setu.*" \
  --nsFrom="sambandh_setu.*" \
  --nsTo="sambandh_setu_restore_diag.*" \
  "/backups/<date>/sambandh_setu"
```

Gotcha: pass the **database directory** (`.../sambandh_setu`), not the dump
root, when using `--nsFrom/--nsTo`.

Verify counts, then drop the temp DB:

```bash
mongosh "$MONGODB_URI" --quiet --eval '
  const s = db.getSiblingDB("sambandh_setu");
  const r = db.getSiblingDB("sambandh_setu_restore_diag");
  let ok = true;
  for (const c of s.getCollectionNames().sort()) {
    const a = s.getCollection(c).countDocuments();
    const b = r.getCollection(c).countDocuments();
    if (a !== b) ok = false;
    print(`${c}: src=${a} restore=${b} ${a === b ? "OK" : "MISMATCH"}`);
  }
  print(`ALL_MATCH=${ok}`);
  db.getSiblingDB("sambandh_setu_restore_diag").dropDatabase();
'
```

The production app user `setu_prod_app` is `readWrite` and may not have
`dropDatabase`. Create a temporary `dbAdmin` user in Atlas for cleanup, then
remove it, or drop the temp DB in the Atlas UI.

### 9.4 Production restore (approved only)

1. Lead approval + incident note.
2. Take a pre-restore dump.
3. Freeze writes / put the app in maintenance if possible.
4. Restore to the temp DB, verify, then restore/cut over to `sambandh_setu`.
5. Verify `/health`, counts and a smoke test.
6. Announce recovery, data-loss window and follow-ups.

### 9.5 M10+ upgrade (preferred)

Atlas → `Setu Production` → `setu-production` → **Edit Configuration** → M10 →
enable **Cloud Backup** → apply. Then:

```bash
node scripts/check-prod-backup.js
```

It must print a snapshot ID. M10+ enables PITR and a much lower RPO.

## 10. Alert response

Severity:

| Level | Examples | Response |
|---|---|---|
| P0 | prod API/DB down, auth broken, data leak/privacy breach, exposed secret, 5xx >10% for 5 min | acknowledge ≤5 min; report the same minute if leak; rollback/escalate |
| P1 | Guide down or fallback failing, one prod monitor down, backups failing, first call >5 s | acknowledge ≤15 min; fix or fallback |
| P2 | staging issues, cosmetic, non-user-facing | next working block |

UptimeRobot → alert contact `9033668` (team channel; confirm the address in the
dashboard, do not put personal contact details in this public repo).

Flow:

1. Acknowledge the alert; note the monitor, time and URL.
2. Check Render status/deploy history and `/health`.
3. Check Atlas connections/disk; check recent deploys.
4. If deploy-related, roll back first, then debug.
5. If DB-related, follow section 9; do not restore without approval.
6. Post an update: impact, action, next update time.
7. Test alert: follow `docs/runbooks/prod-alerts-backups.md` (contact test or a
   temporary 500 monitor); a human must confirm delivery.

No automatic paging exists yet; email is the only confirmed channel until the
Slack/Discord webhook lands.

## 11. Owners and escalation

| Area | Owner | Notes |
|---|---|---|
| DevOps 1, Atlas, Render, smoke, backups | Aditya | this runbook |
| DevOps 2, security headers/CORS/rate limits/email/CI | Ankit | D3-18/D3-25 handoffs |
| API contract, OTP, `/guide/chat` | Sakshi | blocks smoke checks 4–6 |
| Guide service/AI fallback | Ujala | `USE_MOCK` owner |
| Frontend release/signed build | Karan | `EXPO_PUBLIC_API_URL`, `USE_MOCK=false` |
| Website/waitlist/launch comms | Pooja | |
| Backend lead | Bharath | on leave; confirm escalation contact |

Escalation: team channel first; if no response in 15 minutes for P1/P0, call the
lead. For a leak/privacy/crash, report the same minute. Do not include secrets,
tokens, OTPs or user data in the report.

## 12. Launch checklist and current gaps

Exit criteria (Day 3):

- [ ] Production Node + Guide live, `/health` green.
- [ ] Full smoke test passes (all 8 checks, no skips).
- [ ] Production alerts fire to the team channel; test alert confirmed.
- [ ] Atlas backup enabled with a snapshot, or manual dump+restore drill
      accepted by the lead.
- [ ] Email OTP signup works end to end.
- [ ] Security headers, CORS allow-list, auth rate limit live.
- [ ] Guide four quick actions + safe fallback work through Node.
- [ ] Signed release build points at the production Node URL.
- [ ] Website/waitlist live.
- [ ] Closed test started.

Current gaps (2026-11-14):

| Gap | Impact | Owner |
|---|---|---|
| Production Render services not created (no API access) | no prod URLs; D3-12/14 blocked | Aditya + lead |
| `dev` lacks merged Day 1/2 PRs | deploy would miss Dockerfile, health, CI, log fixes | lead/reviewers |
| `/auth/send-otp`, OTP verify, `/guide/chat` missing | smoke checks 4–6 fail; no production login path | Sakshi |
| CORS `*`, no Helmet, no auth rate limit | security exit criteria fail | Ankit |
| Atlas M0 `backupEnabled=false` | no PITR/snapshot; D3-14 backup check fails | lead decision |
| Production network `0.0.0.0/0` | broad DB exposure | Aditya (temporary) |
| Frontend bundle `REPLACE-WITH-STAGING-URL`, `USE_MOCK=true` | release points at staging/mock | Karan |
| Staging `dev-login` blocked because `NODE_ENV=production` | staging UI login path broken; production needs OTP | Sakshi/Ankit |
| UptimeRobot API key exposed earlier | automation key must be rotated | Aditya |
| Guide staging 91.5% one-day uptime | cold starts/outage; 5-min monitor required | Aditya/Ujala |

## 13. Troubleshooting

| Symptom | Check | Action |
|---|---|---|
| `/health` 503 | Render logs; Atlas access list; `MONGODB_URI` | fix DB user/network/URI; redeploy |
| `/health` 404 | wrong service/branch; health path | deploy `dev` with `/health` alias; set health path |
| Guide 502/504 | Guide `/health`, Render logs, cold start | wait/keep-warm; `USE_MOCK=true` fallback |
| CORS error in browser | response `Access-Control-Allow-Origin` | fix `CORS_ORIGINS` allow-list; no `*` in prod |
| 401 on every request | `JWT_SECRET` changed/missing | update env, redeploy; expect sessions invalid |
| Mongo auth failed | Atlas user/password, URI encoding | rotate/fix; update Render; never print |
| Slow first Guide call | free instance asleep | 5-min monitor or paid always-on |
| Port bind error on Guide | Dockerfile hardcodes 8000 | use native Python / `$PORT` |
| Frontend hits staging | bundle string | rebuild with prod `EXPO_PUBLIC_API_URL` |
| OTP email missing | `EMAIL_API_KEY`, provider logs | fix key; check spam; do not log OTP |

## 14. Change management

1. One branch per task (`devops/D3-XX-name`), PR into `dev`.
2. One other person reviews; the lead merges. The author never merges or pushes
   directly to `dev`/`main`.
3. No red CI; no secrets in code, commits, logs, PR text or chat.
4. Production changes are announced in the team channel with the commit and
   rollback plan.
5. After each task: what changed, files, how to verify, Done-when status.

## Appendix A — quick commands

```bash
# backend tests
cd backend && npm test

# config isolation (D3-11)
node scripts/check-prod-config.js --prod <prod.env> --staging <staging.env>
node --test test/prod-config-isolation.test.js

# smoke (D3-12)
scripts/smoke-test.sh --base-url <node> --guide-url <guide>

# backups (D3-14)
node scripts/check-prod-backup.js

# manual dump (no URI value in history)
mongodump --uri="$MONGODB_URI" --out="/backups/setu-prod-$(date +%F)" --quiet
```

## Appendix B — file map

| Path | Purpose |
|---|---|
| `backend/server.js` | Express app, health, routes |
| `Dockerfile` | production Node image |
| `render.yaml` | staging Render blueprint |
| `scripts/smoke-test.js` | cross-platform smoke test; `.sh`/`.ps1` wrappers |
| `scripts/check-prod-config.js` | fails on staging reuse/placeholders |
| `scripts/check-prod-backup.js` | Atlas backup/snapshot readiness |
| `scripts/setup-prod-monitors.ps1` | creates prod UptimeRobot monitors |
| `scripts/generate-prod-secrets.ps1` | generates prod secrets outside git |
| `docs/env/production-env.md` | prod env names/isolation |
| `docs/deploy-production.md` | prod deploy steps |
| `docs/runbooks/backup-restore.md` | staging restore drill |
| `docs/runbooks/prod-alerts-backups.md` | prod alert/backup checklist |
| `docs/observability/error-tracking.md` | Sentry setup |

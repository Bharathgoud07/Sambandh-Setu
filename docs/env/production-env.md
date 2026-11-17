# Production environment — names, isolation and verification (D3-11)

Owner: Aditya (DevOps 1). Updated: 2026-11-17.
Rule: **names and paths only — this file must never contain a secret value.**

Source of names: `setu-guide/docs/env-vars.md` (PR #44) plus `SENTRY_DSN` from
D2-23. Production adds no new application variables.

## 1. Isolation target (created 2026-11-14)

| Item | Production | Staging (must differ) |
|---|---|---|
| Atlas org | `Aditya's Org` (`6af73245bc56668ae12d4683`) | same org, different project |
| Atlas project | **`Setu Production`** (`6af7de8d05cbff3cac56c9e5`) | `Project 0` (`6af73245bc56668ae12d4704`) |
| Atlas cluster | **`setu-production`** (`6af7de987eb8f34eea9760c8`) | `setu-staging` (`6af73fce61c36efa1d17a0ee`) |
| Cluster host | `setu-production.7adxz9v.mongodb.net` | `setu-staging.ujzcbgc.mongodb.net` |
| Tier / region | M0 Free, AWS `ap-south-1` (Mumbai), MongoDB 8.0.37 | M0 Free, same region |
| DB user | **`setu_prod_app`** (`readWrite` on `sambandh_setu`; no admin role) | `setu_staging` |
| Network access | `0.0.0.0/0` (**temporary**, see risk) | `0.0.0.0/0` |
| Cloud Backup | **disabled (M0 limitation)** | disabled (M0 limitation) |
| Node service | `sambandh-setu-api-prod` (live 2026-11-16) | `sambandh-setu-backend` |
| Guide service | `setu-guide-prod` (live 2026-11-16) | `setu-guide-1wiy` |
| Sentry environment | `production` (new project/DSN) | `staging` |

Production URLs (live 2026-11-16):

- Node: `https://sambandh-setu-api-prod.onrender.com`
- Guide: `https://setu-guide-prod.onrender.com`

### 1.1 DB role verification (2026-11-16)

Verified with `connectionStatus`: the authenticated user is `setu_prod_app` and
its only role is `readWrite` on `sambandh_setu`. `listCollections` on
`sambandh_setu` succeeds. The production database was empty at verification
time.

If `mongodump` fails with
`user is not allowed to do action [listCollections] on [sambandh_setu]`, the
role is scoped to `admin` instead of the application database. Fix it before
deploy or backup:

1. Atlas → **Setu Production** → **Security** → **Database Access**.
2. Edit `setu_prod_app` → Built-in Role **readWrite** → Database
   **`sambandh_setu`** → Save.
3. Re-run the role check; do not proceed while the role is `admin`.

An Atlas CLI equivalent (project owner only):

```bash
atlas dbusers update setu_prod_app \
  --role readWrite@sambandh_setu \
  --projectId 6af7de8d05cbff3cac56c9e5
```

## 2. Production environment variables

### Node backend (`Bharathgoud07/Sambandh-Setu`)

| Variable | Production value / source | New secret? | Where |
|---|---|---|---|
| `NODE_ENV` | `production` | no | Render env |
| `PORT` | Render assigns it; do not set manually | no | Render |
| `MONGODB_URI` | `C:\Users\adity\.setu-secrets\prod\mongodb-uri.txt` | **yes** | Render env (secret) |
| `JWT_SECRET` | `C:\Users\adity\.setu-secrets\prod\jwt-secret.txt` (64 chars) | **yes** | Render env (secret) |
| `GUIDE_SERVICE_URL` | production Guide URL (no trailing slash) | no | Render env |
| `SENTRY_DSN` | new production Sentry project/DSN | **yes** | Render env (secret) |
| `CORS_ALLOWED_ORIGINS` | comma-separated exact website + Expo web origins; no `*` (D1-09) | no | Render env |
| `TRUST_PROXY` | `1`; Render terminates TLS and supplies the client IP in `X-Forwarded-For` (D1-10) | no | Render env |
| `EMAIL_API_KEY` | provider key for OTP mail (Ankit) | **yes** | Render env (secret) |
| `INTERNAL_API_KEY` | only if Guide service auth is enabled | **yes** | Render env (secret) |

### Setu Guide (`ujala100/setu-guide`)

| Variable | Production value / source | New secret? | Where |
|---|---|---|---|
| `PYTHON_VERSION` | `3.11.9` (matches Docker/test runtime) | no | Render env |
| `USE_MOCK` | `true` for launch (template fallback; no vendor key needed) | no | Render env |
| `LLM_PROVIDER` | `placeholder` while `USE_MOCK=true` | no | Render env |
| `LLM_API_KEY` | only if `USE_MOCK=false`; must be a **new** key | **yes** | Render env (secret) |
| `LLM_TIMEOUT_SECONDS` | `10` | no | Render env |
| `RATE_LIMIT_PER_USER` | `30/minute` | no | Render env |
| `RATE_LIMIT_PER_IP` | `60/minute` | no | Render env |
| `TRUSTED_PROXY` | `false` (match staging; revisit if Render proxy is trusted) | no | Render env |
| `CACHE_ENABLED` | `true` | no | Render env |
| `CACHE_TTL_SECONDS` | `600` | no | Render env |
| `CACHE_MAX_ITEMS` | `500` | no | Render env |
| `LOG_LEVEL` | `INFO` | no | Render env |
| `INTERNAL_API_KEY` | only if service auth is enabled | **yes** | Render env (secret) |

### Expo frontend (`karanpandeyklk/Setu_app`)

| Variable | Production value / source | New secret? | Where |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | production Node URL (Ankit, D3-18) | no (public) | EAS/host env |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | public OAuth client ID | no (public) | EAS/host env |

### Must be newly generated (never reused from dev/staging)

`JWT_SECRET`, the production DB password (inside `MONGODB_URI`),
`LLM_API_KEY` (if `USE_MOCK=false`), `INTERNAL_API_KEY` (if enabled),
`SENTRY_DSN` (new project), `EMAIL_API_KEY`, and a new UptimeRobot API key for
production monitors.

## 3. Verification (no secret values printed)

Generate the two secrets (writes outside the repo, prints only paths/lengths):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-prod-secrets.ps1
```

Compare production with staging before deploying:

```bash
node scripts/check-prod-config.js --prod <prod.env> --staging <staging.env>
```

The check fails when:

- a sensitive value equals staging (`JWT_SECRET`, `MONGODB_URI`,
  `GUIDE_SERVICE_URL`, `SENTRY_DSN`, `LLM_API_KEY`, `INTERNAL_API_KEY`,
  `CORS_ALLOWED_ORIGINS`, `EXPO_PUBLIC_API_URL`);
- the production Mongo host or DB user equals staging;
- `JWT_SECRET` is shorter than 32 characters;
- `NODE_ENV` is not `production`;
- a placeholder (`REPLACE-WITH...`, `changeme`, `<...>`) or a staging/local
  marker (`staging`, `localhost`, `127.0.0.1`) is present.

Unit tests use synthetic fixtures only:

```bash
node --test test/prod-config-isolation.test.js
```

## 4. Risks and decisions

> **Free-only policy:** no paid upgrades, paid plans, paid static IPs or paid
> backup tiers. If a free-tier limit blocks launch, escalate to the lead; never
> purchase or click a paid upgrade.

1. **Network access is `0.0.0.0/0`.** Atlas SCRAM + TLS protect the cluster, but
   this is broader than needed. Render static outbound IPs/private endpoints are
   paid and **not approved**; keep `0.0.0.0/0` with a strong DB password and
   revisit only if the company approves budget.
2. **No Atlas Cloud Backup on M0.** `backupEnabled=false`; an M10+ upgrade is
   paid and **not approved**. The launch path is a manual `mongodump` plus a
   restore drill (RPO up to 24 h); document it as the accepted risk.
3. **Render production services live in Ujala's workspace.** Render Free cannot
   add team members, so Aditya manages them through a locally stored API token
   instead of dashboard membership. The API key must be revoked after the final
   production operation; do not commit or paste it.
4. **Guide mode.** `USE_MOCK=true` keeps the template fallback and avoids a
   vendor key; flip to `false` only with a new `LLM_API_KEY` and an exercised
   `handle_chat`.
5. **CORS is now allow-listed in production.** The 2026-11-17 deploy returns
   `Access-Control-Allow-Origin` only for the configured app/website origins;
   an unknown origin gets no ACAO header.
6. **OTP mail and Node `/guide/chat` are still missing on `dev`.** Helmet,
   CORS and rate limiting are live as of 2026-11-17; the production smoke test
   remains blocked on those owner routes.

## 5. Production security verification — 2026-11-17

Deploy `dep-dbtv2b3m8hqs73dkv83g`, commit `d2e90ee`, status **live**. No secret
values were printed.

| Check | Result |
|---|---|
| `GET /` security headers | `strict-transport-security`, `content-security-policy`, `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: no-referrer`; no `x-powered-by` |
| CORS, configured app origin | ACAO equals `https://setu-app-ten.vercel.app` |
| CORS, configured website origin | ACAO equals `https://sambandh-setu-website.vercel.app` |
| CORS, unknown origin | no ACAO header |
| Global limiter | `ratelimit: limit=300, remaining=299, reset=900` on `GET /` |
| Auth limiter | `ratelimit: limit=5, remaining=4, reset=3600` on one `POST /auth/dev-login`; a 5-request probe returned **429** |
| `/me`, `/connections`, `/chats` without auth | `401` |

`TRUST_PROXY=1` is set on the Render service so the auth limiter keys on the
real client IP instead of Render's proxy address. Do not repeat the five-request
429 probe: it consumes the hourly auth bucket for the test client. The limiter
unit tests cover the 429 response contract.

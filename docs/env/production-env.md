# Production environment — names, isolation and verification (D3-11)

Owner: Aditya (DevOps 1). Updated: 2026-11-14.
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
| DB user | **`setu_prod_app`** (`readWrite`, no admin role) | `setu_staging` |
| Network access | `0.0.0.0/0` (**temporary**, see risk) | `0.0.0.0/0` |
| Cloud Backup | **disabled (M0 limitation)** | disabled (M0 limitation) |
| Node service | `sambandh-setu-api-prod` (to create) | `sambandh-setu-backend` |
| Guide service | `setu-guide-prod` (to create) | `setu-guide-1wiy` |
| Sentry environment | `production` (new project/DSN) | `staging` |

Production URLs (proposed, confirm after service creation):

- Node: `https://sambandh-setu-api-prod.onrender.com`
- Guide: `https://setu-guide-prod.onrender.com`

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
| `CORS_ORIGINS` | website + Expo web origins (once Ankit's allow-list lands) | no | Render env |
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
  `CORS_ORIGINS`, `EXPO_PUBLIC_API_URL`);
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
3. **Render access is not available to this workstation.** The Node and Guide
   production services and their env vars must be created in the Render
   dashboard (or via a locally stored API token). Until then the production
   URLs do not exist.
4. **Guide mode.** `USE_MOCK=true` keeps the template fallback and avoids a
   vendor key; flip to `false` only with a new `LLM_API_KEY` and an exercised
   `handle_chat`.
5. **CORS is still open** (`app.use(cors())`; `Access-Control-Allow-Origin: *`)
   until Ankit's allow-list lands. That is a launch security finding.
6. **`/guide/chat`, OTP mail and security headers are not on `dev` yet**; the
   production smoke test cannot pass until those owner PRs merge.

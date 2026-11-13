# Staging deploy - Node backend (D2-21)

Owner: Aditya (DevOps 1). Host: Render free tier (recommended; see "Alternatives").

The repo contains everything the host needs: `Dockerfile`, `.dockerignore`,
`render.yaml`, and a `/health` endpoint that returns 503 when MongoDB is not
connected. No secret is stored in the repo - every value below is set in the
host dashboard.

## 1. Environment variables (names only)

| Variable | Value source | Secret |
|---|---|---|
| `NODE_ENV` | `production` | no |
| `MONGODB_URI` | Atlas connection string | yes |
| `JWT_SECRET` | at least 32 random characters | yes |
| `GUIDE_SERVICE_URL` | Setu Guide base URL, no trailing slash | no |
| `PORT` | set by the host (Render injects it) | no |

Full name sheet: `setu-guide/docs/env-vars.md`.

## 2. Render (recommended, free)

1. Render dashboard -> **New +** -> **Web Service** -> connect the
   `Bharathgoud07/Sambandh-Setu` repo.
2. Branch: `dev`.
3. Runtime: **Docker**. Dockerfile path: `./Dockerfile`. Context: `.`.
4. Instance type: **Free**. Region: **Singapore**.
5. Health check path: **`/health`**.
6. Environment -> add the variables from the table above. Never paste a value
   into a commit, PR or ticket.
7. **Create Web Service** and wait for the first deploy.
8. Copy the public URL (for example `https://sambandh-setu-backend.onrender.com`).

The free instance sleeps after 15 minutes without traffic. Cold start is
30-60 s. Keep it warm with a 5-minute UptimeRobot monitor on `/health`
(same pattern as the Guide - see D2-22).

Alternative to the dashboard: commit `render.yaml` and use
**New + -> Blueprint**. The four `sync: false` values still have to be filled
in manually.

## 3. Verify (automatable)

```bash
cd backend
STAGING_BASE_URL=https://<backend-host> npm run verify:staging
```

Expected:

```
PASS root           HTTP 200 in ...ms
PASS health         HTTP 200 in ...ms
PASS health/live    HTTP 200 in ...ms
PASS health/ready   HTTP 200 in ...ms

All staging checks passed.
```

A `503` from `health` or `health/ready` means MongoDB is not reachable from the
host - check `MONGODB_URI` and the Atlas IP access list.

## 4. Local container check

```bash
docker build -t setu-backend:local .
docker run --rm -p 5000:5000 \
  -e MONGODB_URI="mongodb://127.0.0.1:27017/sambandh_setu" \
  -e JWT_SECRET="local-test-secret-at-least-32-characters" \
  setu-backend:local
```

## 5. Alternatives

- **Railway**: New Project -> Deploy from repo -> Dockerfile detected ->
  set the same variables -> health check `/health`. Free trial credit, then paid.
- **Fly.io**: `fly launch --dockerfile Dockerfile` -> `fly secrets set` for the
  two secrets -> `fly deploy`. No permanent free tier.

## 6. Rollback

Render keeps previous deploys: **Deploys -> ... -> Rollback**. For a code
rollback, revert the merge commit on `dev` and let auto-deploy run.

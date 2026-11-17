# Production alerts + backups (D3-14)

Owner: Aditya (DevOps 1). Updated: 2026-11-16.
No secret values in this file.

> **Free-only policy:** no paid plan, paid add-on, paid static IP or paid
> backup tier. The production cluster stays on M0; the accepted backup path is
> a manual `mongodump` + restore drill. Never click a paid upgrade.

## 0. Preconditions

- [ ] Production Node and Guide URLs are live (D3-12).
- [ ] UptimeRobot alert contact `9033668` is still the team channel; confirm
      the address in the dashboard. Do not put personal emails in this public
      repo.
- [ ] Atlas production project `Setu Production`
      (`6af7de8d05cbff3cac56c9e5`) / cluster `setu-production`.

## 1. Create production monitors

Dashboard (exact steps):

1. UptimeRobot → **Add New Monitor**.
2. Type **HTTP(s)**.
3. Friendly name `Setu PROD - Node /health`; URL
   `https://sambandh-setu-api-prod.onrender.com/health`.
4. Monitoring interval **30 minutes**. This is the free-only compromise: a
   5-minute keep-warm check would consume about 744 instance-hours/month per
   service, but Render Free allows ~750 per workspace.
5. Alert contacts: `9033668` (team email).
6. Create. For the Guide use `Setu PROD - Guide liveness` with
   `https://setu-guide-prod.onrender.com/openapi.json`.
7. Confirm both show **Up** after their first check (up to 30 minutes).

**Why `/openapi.json` for the Guide?** UptimeRobot Free sends `HEAD` (choosing
`GET` is a paid feature). FastAPI's `GET /health` returns **405** to `HEAD`,
while `/openapi.json` (and `/docs`) returns **200** to `HEAD`. Monitoring
`/openapi.json` proves the FastAPI app is serving; the Node `/health` check
still includes the DB readiness state.

Created 2026-11-16 with the API script:

| Service | Monitor ID | State |
|---|---|---|
| Guide liveness (`/openapi.json`) | `804695804` | **Up** (HTTP 200; 30-minute interval) |
| Node `/health` | `804695322` | **Up** after the 2026-11-16 production deploy (`/health` returned `200 ready`; 30-minute interval) |

The staging keep-warm monitors (`804664536`, `804661990`) were **paused** on
2026-11-16 so staging can sleep. Production cold starts are accepted until a
free always-on option or paid plan is approved; alert detection can lag by up
to 30 minutes.

A direct Guide `GET /health` returned `200 {"status":"ok"}` in 22.8 s after the
first Render cold start. D3-14 still needs the UptimeRobot test-alert receipt
confirmation from contact `9033668`; both production monitors themselves are
Up.

Script alternative (reads the API key from a local file; prints IDs only):

```powershell
powershell -File scripts/setup-prod-monitors.ps1 `
  -NodeUrl https://sambandh-setu-api-prod.onrender.com `
  -GuideUrl https://setu-guide-prod.onrender.com
```

Dry run (no API call):

```powershell
powershell -File scripts/setup-prod-monitors.ps1 -DryRun `
  -NodeUrl https://sambandh-setu-api-prod.onrender.com `
  -GuideUrl https://setu-guide-prod.onrender.com
```

> The UptimeRobot main API key was exposed earlier; rotate it and store the new
> key in `C:\Users\adity\.setu-secrets\uptimerobot-api-key.txt` before using
> the script.

## 2. Trigger and confirm a test alert

Option A — alert-contact test (fastest):

1. UptimeRobot → **Alert Contacts** → select contact `9033668` → **Test**.
2. Confirm the email/Slack message arrives.
3. Record the timestamp and who confirmed it.

Option B — monitor event (closer to production):

1. Add a temporary monitor `Setu PROD alert test` with URL
   `https://httpstat.us/500`, interval 30 minutes, same alert contact.
2. Wait for the first check; it should go **Down** and send an alert.
3. Confirm the channel; delete the temporary monitor.
4. Record monitor ID, event time, and confirmer.

A production run is not done until a human confirms the alert arrived. No
`--allow-skips` equivalent here.

On 2026-11-16 a temporary `https://httpstat.us/500` monitor (`804695850`) was
created, reset, and detected `Connection Timeout` at **21:40:37 IST**; the
alert was sent to contact `9033668`. The monitor was deleted immediately after.
The contact's owner must confirm receipt in the dashboard/email; contact
`9033668` is not Aditya's mailbox.

## 3. Verify Atlas Cloud Backup

Automated check (uses the Atlas CLI):

```bash
node scripts/check-prod-backup.js
```

Expected today: **FAIL** because `setu-production` is M0
(`backupEnabled=false`). M0 does not support Cloud Backup or point-in-time
recovery. Actual result on 2026-11-16:

```text
cluster=setu-production tier=REPLICASET backupEnabled=false
FAIL Cloud Backup is disabled. M0 does not support Cloud Backup/PITR.
```

On this workstation the Atlas CLI is not on `PATH`; set it for the check:

```powershell
$env:ATLAS_BIN = "C:\Users\adity\bin\atlas\atlas.exe"
node scripts/check-prod-backup.js
```

Free-only path (approved):

1. **Manual `mongodump` + restore drill (M0):**
   - Verify `setu_prod_app` has `readWrite` on `sambandh_setu`, not `admin`.
     A role scoped to `admin` fails with `listCollections` before any data is
     dumped.
   - Run from an allowed host (production network is currently `0.0.0.0/0`;
     restrict it after launch if a free option appears).
   - MongoDB Database Tools 100.20.0 are installed at
     `C:\Users\adity\bin\mongodb-database-tools\bin` and added to the user
     `PATH` on this workstation.
   - Command template — never paste the real URI into a ticket or chat:
     ```bash
     mongodump --uri="$MONGODB_URI" --out="/backups/setu-prod-$(date +%F)" --quiet
     ```
   - Store the dump off-cluster, encrypted.
   - Restore into a **temporary database** first, verify counts, then drop it.
   - Take one dump before launch and one after the pilot starts.
   - Accepted risk: RPO up to 24 h; document it in the launch sign-off.

Future option (requires explicit company budget approval; **do not click now**):
Atlas → `Setu Production` → `setu-production` → **Edit Configuration** → M10 →
enable **Cloud Backup** → apply. Only after approval, re-run
`node scripts/check-prod-backup.js`; it must print a snapshot ID.

## 4. Evidence to attach to D3-14

| Item | Value |
|---|---|
| Node monitor ID | `804695322` (`/health`, Up) |
| Guide monitor ID | `804695804` (`/openapi.json` liveness; Up) |
| Test alert timestamp | `2026-11-16 21:40:37 IST` — temporary monitor `804695850`, event `Connection Timeout`; monitor deleted |
| Alert confirmed by | **pending** — sent to contact `9033668`; owner must confirm receipt |
| Atlas backup mode | M0 manual dump (free-only) |
| Snapshot ID / dump path | `C:\Users\adity\AppData\Local\Temp\opencode\prod-dump-2026-11-16` (synthetic drill; 1 document) |
| Restore drill result | **PASS** — 1 collection, 1/1 documents; local temp DB dropped; synthetic production collection dropped; production DB returned to 0 collections |

Drill log (2026-11-16):

1. Corrected `setu_prod_app` from `readWrite` on `admin` to `readWrite` on
   `sambandh_setu`; verified `listCollections` succeeds.
2. Seeded one synthetic document in `ops_backup_drill`, ran `mongodump`, and
   restored it into a local `mongo:7` container as
   `sambandh_setu_restore_diag`.
3. Source and restore both reported 1 collection / 1 document
   (`ALL_MATCH=true`).
4. Dropped the local temp DB and the synthetic production collection; production
   has 0 collections again.

**Remaining manual evidence:** the owner of UptimeRobot contact `9033668`
(Ujala's mailbox, not Aditya's) must confirm the test alert arrived. Until then,
D3-14 is **NEEDS MANUAL STEP**, not DONE.

## 5. Risks

- M0 has no PITR; worst-case RPO is the manual dump interval.
- Alert channel is email only until the Slack/Discord webhook exists.
- UptimeRobot API key exposure means a new key is required before trusting
  monitor automation.
- Free Render instances sleep; production checks run every 30 minutes, so the
  first request after sleep can be slow or return `503 GUIDE_UNAVAILABLE` until
  the Guide wakes.
- **Free-hour decision (2026-11-16):** Render Free allows about 750
  instance-hours/month per workspace. Four 5-minute keep-warm monitors exceeded
  that by roughly 4x. Staging keep-warm monitors were paused; production checks
  are 30 minutes, so services can sleep between checks. Alerts can lag by up to
  30 minutes and cold starts are accepted. No paid plan was purchased.

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
4. Monitoring interval **5 minutes**.
5. Alert contacts: `9033668` (team email).
6. Create. Repeat for `Setu PROD - Guide /health` with
   `https://setu-guide-prod.onrender.com/health`.
7. Confirm both show **Up** within 5 minutes.

Created 2026-11-16 with the API script:

| Service | Monitor ID | State |
|---|---|---|
| Guide `/health` | `804695321` | live check; 60 s timeout because the first Render cold start can exceed 30 s |
| Node `/health` | `804695322` | **paused** until D3-12 deploys; unpause after `/health` returns 200 |

The Guide monitor's first check returned `Bad Gateway` during the Render cold
start. A later manual check returned `200 {"status":"ok"}` in 22.8 s. Keep the
60 s timeout and 5-minute interval; do not mark the monitor healthy until the
dashboard shows **Up**.

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
   `https://httpstat.us/500`, interval 5 minutes, same alert contact.
2. Wait for the first check; it should go **Down** and send an alert.
3. Confirm the channel; delete the temporary monitor.
4. Record monitor ID, event time, and confirmer.

A production run is not done until a human confirms the alert arrived. No
`--allow-skips` equivalent here.

## 3. Verify Atlas Cloud Backup

Automated check (uses the Atlas CLI):

```bash
node scripts/check-prod-backup.js
```

Expected today: **FAIL** because `setu-production` is M0
(`backupEnabled=false`). M0 does not support Cloud Backup or point-in-time
recovery.

Free-only path (approved):

1. **Manual `mongodump` + restore drill (M0):**
   - Verify `setu_prod_app` has `readWrite` on `sambandh_setu`, not `admin`.
     A role scoped to `admin` fails with `listCollections` before any data is
     dumped.
   - Run from an allowed host (production network is currently `0.0.0.0/0`;
     restrict it after launch if a free option appears).
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
| Node monitor ID | `804695322` (paused until D3-12 deploy) |
| Guide monitor ID | `804695321` |
| Test alert timestamp | **pending** — manual contact `9033668` test not yet confirmed |
| Alert confirmed by | **pending** |
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

**Remaining manual evidence:** a human must confirm the UptimeRobot test alert
arrived at contact `9033668`.

## 5. Risks

- M0 has no PITR; worst-case RPO is the manual dump interval.
- Alert channel is email only until the Slack/Discord webhook exists.
- UptimeRobot API key exposure means a new key is required before trusting
  monitor automation.
- Free Render instances sleep; without the 5-minute monitor the Guide first
  call can exceed 5 s.

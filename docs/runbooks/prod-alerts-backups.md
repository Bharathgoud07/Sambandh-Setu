# Production alerts + backups (D3-14)

Owner: Aditya (DevOps 1). Updated: 2026-11-14.
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
| Node monitor ID | |
| Guide monitor ID | |
| Test alert timestamp | |
| Alert confirmed by | |
| Atlas backup mode | M0 manual dump (free-only) |
| Snapshot ID / dump path | |
| Restore drill result | |

## 5. Risks

- M0 has no PITR; worst-case RPO is the manual dump interval.
- Alert channel is email only until the Slack/Discord webhook exists.
- UptimeRobot API key exposure means a new key is required before trusting
  monitor automation.
- Free Render instances sleep; without the 5-minute monitor the Guide first
  call can exceed 5 s.

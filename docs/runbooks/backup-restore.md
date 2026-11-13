# Backup and restore runbook

- **Task:** D2-25 (legacy ops)
- **Owner:** Aditya (DevOps Intern 1)
- **Last restore drill:** 2026-11-13
- **Scope:** `sambandh_setu` database on the staging MongoDB Atlas cluster

## 1. Environment

| Item | Value |
|---|---|
| Atlas project | `Project 0` (`6af73245bc56668ae12d4704`) |
| Cluster | `setu-staging` |
| Tier | M0 Free, AWS `ap-south-1` (Mumbai) |
| Database | `sambandh_setu` |
| App user | `setu_staging` (`readWriteAnyDatabase`, `dbAdminAnyDatabase`) |

Production Atlas is still owned by Bharath. The same procedure applies once
project access is granted; do not reuse staging credentials in production.

## 2. Current limitation: M0 Free tier

Atlas **Cloud Backup / point-in-time recovery requires M10 or higher**. The M0
free tier does not provide automated backups, so this project uses **logical
dumps** (`mongodump`).

| Metric | Value with daily dumps |
|---|---|
| RPO (max data loss) | up to 24 hours |
| RTO (restore time) | ~10 minutes at the current size (< 1 MB) |

If the launch needs a lower RPO, upgrade the cluster to M10+ and enable Cloud
Backup, or run dumps more frequently.

## 3. Prerequisites

- Docker running locally (the `mongo:7` image includes `mongodump`/`mongorestore`
  100.x), or MongoDB Database Tools installed.
- `MONGODB_URI` in `backend/.env` (gitignored). **Never commit the URI, paste it
  into chat/tickets, or put it in shell history.** Prefer `--config` over
  `--uri` on shared machines because process listings can expose arguments.

## 4. Backup (dump)

Dumps are written **outside the repository** and never committed.

```bash
mkdir -p backups/$(date +%F)
docker run --rm \
  -v "$PWD/backups:/dump" \
  --env-file backend/.env \
  mongo:7 \
  sh -c 'mongodump --uri="$MONGODB_URI" --out=/dump/$(date +%F) --quiet'
```

Retention: keep **7 daily** and **4 weekly** dumps, encrypted at rest. A dump of
the current dataset is ~40 KB (21 files, 10 collections).

> Store dumps in an encrypted bucket or an access-controlled machine. They
> contain user profile data, so treat them as sensitive.

## 5. Restore drill

Always restore into a **temporary database** on the staging cluster, verify, then
drop it. Never restore over production without lead approval.

```bash
docker run --rm \
  -v "$PWD/backups:/dump" \
  --env-file backend/.env \
  mongo:7 \
  sh -c 'mongorestore --uri="$MONGODB_URI" \
    --nsInclude="sambandh_setu.*" \
    --nsFrom="sambandh_setu.*" \
    --nsTo="sambandh_setu_restore_diag.*" \
    /dump/2026-11-13/sambandh_setu'
```

**Gotcha:** with `--nsFrom/--nsTo`, pass the **database directory**
(`.../sambandh_setu`), not the dump root. Passing the root prints
`don't know what to do with subdirectory ... skipping` and restores 0 documents.

Alternative if the namespace flags misbehave: copy the dump, rename the
`sambandh_setu` directory to the temp database name, and restore the copy.

Verify row counts, then clean up:

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

`dbAdminAnyDatabase` is required for the cleanup `dropDatabase()`.

## 6. Evidence — drill on 2026-11-13

- Dump: **40 KB / 21 files**, 10 collections.
- Restore target: `sambandh_setu_restore_diag` (temporary database).
- Restored: **36 documents across 10 collections**.
- Count comparison: **all collections matched** (`ALL_MATCH=true`).
- Temporary database dropped after verification.
- `verify:staging` also reported all endpoints healthy after the drill.

## 7. Recommended automation

1. Nightly dump via a GitHub Actions scheduled workflow (store `MONGODB_URI` as
   an encrypted repository/environment secret) or Windows Task Scheduler.
2. Upload to encrypted object storage with 7-daily / 4-weekly retention.
3. Alert on failure (email or an UptimeRobot heartbeat).
4. Run this restore drill **monthly** and record the result.

## 8. Production notes

- Request access to Bharath's Atlas project before the launch; keep production
  and staging credentials separate.
- Use a least-privilege backup user for dumps and a separate admin user only for
  restore drills.
- If any credential is exposed (chat, logs, PR text), rotate it immediately and
  update the Render environment variable.

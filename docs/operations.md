# Operations Runbook

## 1. What this document is

This is the operational runbook for `mankahi.work.gd`: a 2-node arm64 k3s
cluster on OCI Always Free, deployed via GitOps through Argo CD — every merge
to `main` reaches the cluster in roughly 3 minutes, with no manual `kubectl
apply` in the steady state. It covers backups, restore drills, alerting, and
incident logging. It assumes familiarity with `docs/gitops.md` (Argo CD +
Sealed Secrets mechanics) and does not repeat that material.

## 2. Postgres backups

**How it works.** A CronJob named `postgres-backup` runs daily at 02:00 UTC in
namespace `mankahi` (manifest:
`kubernetes/platform/backups/postgres-backup-cronjob.yaml`, applied by the
Argo CD child app `mankahi-backups`). An init container runs `pg_dump -Fc`
against the live `postgres-service` and writes a custom-format dump to a
shared `emptyDir`. The main container then streams that dump to the
`mankahi-backups` OCI Object Storage bucket over the S3-compatible endpoint
(path-style addressing, matching how the application's own MinIO SDK already
talks to this endpoint), and prunes older dumps down to the newest 14 in the
same run.

**Where to check:**
- Bucket prefix: `postgres/` in the `mankahi-backups` bucket.
- Argo CD: application `mankahi-backups` (sync-wave 1).
- Cluster: `kubectl get cronjob -n mankahi` and `kubectl get jobs -n mankahi`.

**Least-privilege caveat.** The S3 credential used by the upload step is the
tenancy user's customer secret key — it is user-scoped, not bucket-scoped, so
it carries more reach than this job needs. Follow-up: create a dedicated IAM
user and policy scoped to the `mankahi-backups` bucket only.

## 3. Restore drill (perform quarterly; an unrestored backup is a hope, not a backup)

a. List dumps:
   ```
   aws --endpoint-url https://bmknimruc4dp.compat.objectstorage.ap-mumbai-1.oraclecloud.com s3 ls s3://mankahi-backups/postgres/
   ```

b. Download newest:
   ```
   aws --endpoint-url https://bmknimruc4dp.compat.objectstorage.ap-mumbai-1.oraclecloud.com s3 cp s3://mankahi-backups/postgres/DUMPFILE /tmp/restore.dump
   ```

c. Copy into the postgres pod:
   ```
   kubectl cp /tmp/restore.dump mankahi/POSTGRES_POD:/tmp/restore.dump
   ```

d. Create scratch DB:
   ```
   kubectl exec -n mankahi POSTGRES_POD -- psql -U postgres -c "CREATE DATABASE restore_drill;"
   ```

e. Restore:
   ```
   kubectl exec -n mankahi POSTGRES_POD -- pg_restore -U postgres -d restore_drill --no-owner /tmp/restore.dump
   ```

f. Row-count sanity:
   ```
   kubectl exec -n mankahi POSTGRES_POD -- psql -U postgres -d restore_drill -c "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM roles) AS roles;"
   ```
   Compare against the live DB's counts; record both numbers in the drill log below.

g. Cleanup: `DROP DATABASE restore_drill;` and `rm` the dump copies.

h. Drill log:

| date | dump file | rows expected | rows restored | operator |
|------|-----------|----------------|-----------------|----------|
|      |           |                |                  |          |

## 4. Alerts and what they mean

| Alert | Meaning | First response |
|-------|---------|-----------------|
| `InstanceDown` | a scraped backend target remains in SD but fails scrapes for 5m (CrashLoop/unready; note: a deleted pod leaves SD entirely and does NOT trigger this - pod-kill detection requires kube-state-metrics, pending) | kubectl get pods -n mankahi; Argo CD app health; node memory |

**Planned rules (pending metric sources or delivery):**
- `PodCrashLooping` — needs `kube-state-metrics`.
- PVC above 80 percent — needs kubelet volume stats.
- Node memory above 85 percent — needs `node-exporter`.
- Cert expiry under 14d — needs a cert-manager metrics scrape.

Delivery channel: Grafana unified alerting to a Discord webhook (sealed).

## 5. Incident log convention

Incidents live in `docs/incidents/` as `YYYY-MM-DD-short-slug.md`, one file
per incident, written within 48h of resolution.

Post-mortem template:

```
## What happened

## Impact
(who, how long, what failed)

## Timeline
(UTC, terse)

## Root cause

## Fix

## Prevention
(what changed so it cannot recur)
```

Two Phase-4 incidents (a placeholder `ALTER USER` lockout, and a
whitespace-corrupted seal) are documented in `docs/gitops.md` and predate this
convention.

## 6. Standing cautions

- Run `terraform plan` before any apply (node-replacement pending).
- `POSTGRES_USER` must stay `postgres`.
- Generated secrets must be URL-safe only.
- `work.gd` renewal window: 30 days before 2027-07-11.
- Prometheus is intentionally unexposed.

# Operations Runbook

## 1. What this document is

This is the operational runbook for `mankahi.xyz`: a 2-node arm64 k3s
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
backups bucket (terraform output backups_bucket_name) over the S3-compatible
endpoint (path-style addressing, matching how the application's own MinIO SDK
already talks to this endpoint), and prunes older dumps down to the newest 14
in the same run.

**Where to check:**
- Bucket prefix: `postgres/` in the backups bucket (terraform output backups_bucket_name).
- Argo CD: application `mankahi-backups` (sync-wave 1).
- Cluster: `kubectl get cronjob -n mankahi` and `kubectl get jobs -n mankahi`.

**Least-privilege caveat.** The S3 credential used by the upload step is the
tenancy user's customer secret key — it is user-scoped, not bucket-scoped, so
it carries more reach than this job needs. Follow-up: create a dedicated IAM
user and policy scoped to the backups bucket (terraform output backups_bucket_name)
only.

## 3. Restore drill (perform quarterly; an unrestored backup is a hope, not a backup)

Run from the repo root in git-bash (values come from terraform outputs; nothing is hardcoded):
```
export AWS_ACCESS_KEY_ID=$(terraform -chdir=terraform output -raw object_storage_access_key)
export AWS_SECRET_ACCESS_KEY=$(terraform -chdir=terraform output -raw object_storage_secret_key)
EP=$(terraform -chdir=terraform output -raw object_storage_s3_endpoint)
BUCKET=$(terraform -chdir=terraform output -raw backups_bucket_name)
```

a. List dumps:
   ```
   aws --endpoint-url "$EP" s3 ls "s3://$BUCKET/postgres/"
   ```

b. Download newest:
   ```
   aws --endpoint-url "$EP" s3 cp "s3://$BUCKET/postgres/DUMPFILE" /tmp/restore.dump
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

   Expected fresh-DB roles baseline is 3 (admin/author/reader, seeded
   automatically by init).

h. Drill log:

| date | dump file | rows expected | rows restored | operator |
|------|-----------|----------------|-----------------|----------|
|      |           |                |                  |          |

## 4. Alerts and what they mean

| Alert | Meaning | First response |
|-------|---------|-----------------|
| `InstanceDown` | a scraped backend target remains in SD but fails scrapes for 5m (CrashLoop/unready; note: a deleted pod leaves SD entirely and does NOT trigger this) | kubectl get pods -n mankahi; Argo CD app health; node memory |
| `PodCrashLooping` | A container in mankahi restarted more than 3 times in 15m (bad config, crash on boot, OOMKill) | kubectl -n mankahi logs POD --previous; check lastState.terminated.reason (OOMKilled = raise limits); check recent Argo CD sync |
| `DeploymentReplicasUnavailable` | A Deployment's desired replica was unavailable within the last 5m - pod deleted, crashed, or failing readiness; fires on kubectl delete pod (a deliberate kill-pod test) | kubectl -n mankahi get pods -l app=DEPLOYMENT; kill drills self-clear about 5m after Ready |
| `CertificateExpiringSoon` | a cert-manager certificate expires in under 14 days | check cert-manager logs + the certificate resource; renew/reissue |

PodCrashLooping is restart-count based; kubectl delete pod creates a NEW pod
whose restart counter starts at 0, so a pod kill raises
DeploymentReplicasUnavailable (availability-based), not PodCrashLooping. The
availability alert also fires briefly (about 5m) on the very first rollout of
a Deployment (0 to 1 replicas); expected, self-clears. PVC-usage and
node-memory alerts remain follow-ups - KSM exposes no volume/node usage
bytes; both need a kubelet or node_exporter scrape.

**Planned rules (pending metric sources or delivery):**
- PVC above 80 percent — needs kubelet volume stats.
- Node memory above 85 percent — needs `node-exporter`.

Delivery: Grafana unified alerting to a Discord webhook. The bridge rule (any firing Prometheus alert) is provisioned from git; the contact point and routing policy arrive via the sealed grafana-alerting secret (post-seal grafana restart required - provisioning is read at startup).

## 5. Incident log convention

Incidents live in `internal-docs/incidents/` (internal working documents, not
tracked in this repo) as `YYYY-MM-DD-short-slug.md`, one file per incident,
written within 48h of resolution.

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

Two earlier GitOps-migration incidents (a placeholder `ALTER USER` lockout, and a
whitespace-corrupted seal) are documented in `docs/gitops.md` and predate this
convention.

## 6. Standing cautions

- Run `terraform plan` before any apply (node-replacement pending).
- `POSTGRES_USER` must stay `postgres`.
- Generated secrets must be URL-safe only.
- Prometheus is intentionally unexposed.

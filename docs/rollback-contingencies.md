# Phase 4 Rollback Contingencies — GitOps Cutover (Argo CD + Sealed Secrets)

> Written before the Phase 4 cutover against the LIVE production cluster
> (mankahi.work.gd, real users). Every cluster command in this document is
> **HUMAN-executed**. Agents never touch the cluster.
>
> Status note: the secret-scope decision (seal 3 consumed secrets:
> `app-secrets`, `db-secrets`, `grafana-secrets`; retire the 3 unconsumed:
> `redis-secrets`, `minio-secrets`, `elasticsearch-secrets`) is backed by an
> 8-agent full-codebase sweep (below) and pending final human ratification.

## Sweep evidence (why the retirement is safe)

Eight independent read-only scans (one per service, plus init+shared,
frontend, all kubernetes overlays + compose, terraform) returned a
**unanimous SAFE** verdict:

| Scope | Verdict | Decisive evidence |
|---|---|---|
| auth-service | SAFE | env = `services-config` + `app-secrets` only; zero readers of dropped keys |
| blog-service | SAFE | ES client passes no auth option; MinIO SDK uses ACCESS/SECRET keys (kept), never ROOT_* |
| analytics-service | SAFE | only DATABASE_URL (kept) + REDIS_URL (ConfigMap); hard-throws on missing required vars |
| admin-service | SAFE | no ES client wired into health middleware; REDIS_URL from ConfigMap |
| init-service + backend/shared | SAFE | full `process.env` enumeration: 0 readers of any dropped key; init needs only DATABASE_URL |
| frontend | SAFE | consumes zero Secrets (no secretRef in its Deployment at all) |
| kubernetes (base + dev + oci + platform + scripts) & docker/compose | SAFE | dead secrets exist only as definitions / unreferenced `.example` files |
| terraform | SAFE | provisions no k8s Secrets; MinIO pair originates at `oci_identity_customer_secret_key.s3` |

Dropped from `app-secrets` at sealing time (zero code readers):
`POSTGRES_PASSWORD` (raw; already embedded in DATABASE_URL),
`MINIO_ROOT_PASSWORD`, `ELASTICSEARCH_PASSWORD`.

Important nuance: the live secrets were applied manually via envsubst and
carry **no Argo tracking labels** — Argo prune will NOT auto-delete them.
Retiring the 3 dead Secrets is an explicit human step (C8), performed only
after verification. Nothing destructive happens automatically.

## C0 — Master safety net (MANDATORY first step, before ANY cluster change)

Snapshot every current secret:

```bash
kubectl get secret -n mankahi \
  app-secrets db-secrets grafana-secrets \
  redis-secrets minio-secrets elasticsearch-secrets \
  -o yaml | tee secrets-backup-$(date +%Y%m%d).yaml
```

Store the file **encrypted in the password manager**, then delete the local
copy. This snapshot restores any missed consumer in seconds:

```bash
kubectl apply -f secrets-backup-<date>.yaml
kubectl rollout restart deployment -n mankahi
```

Also take a database dump before the postgres password rotation (cheap
insurance; `ALTER USER` itself is transactional and riskless):

```bash
kubectl exec -n mankahi deploy/postgres -- \
  pg_dump -U postgres -d mankahi | tee pre-rotation-$(date +%Y%m%d).sql
```

Keep ALL old secret values in the password manager until the rollback drill
(acceptance criterion 4) has passed.

## C1 — Rollback step zero: pause Argo self-heal

Self-heal will fight any manual fix. Every contingency below starts with:

```bash
argocd app set mankahi --sync-policy none
```

Re-enable after recovery:

```bash
argocd app set mankahi --sync-policy automated --auto-prune --self-heal
```

## C2 — A missed secret consumer surfaces

Symptoms: `CreateContainerConfigError` (missing Secret/key) or runtime auth
failures after the SealedSecrets sync.

1. Pause self-heal (C1).
2. Restore the C0 snapshot: `kubectl apply -f secrets-backup-<date>.yaml`.
3. `kubectl rollout restart deployment -n mankahi`.
4. Diagnose offline; fix the SealedSecret; re-enable sync.

Silent-failure watchpoint (from the sweep): blog-service falls back to
`minioadmin` credentials with **no startup error** if MinIO keys go missing —
presigned image URLs break silently. Therefore the cutover gate (C7) includes
an image-presign smoke test, not just pod health.

## C3 — Postgres password rotation fails

The postgres container reads `POSTGRES_PASSWORD` only at initdb on an empty
volume; on the existing PGDATA the env change alone changes nothing — the
live rotation is `ALTER USER`, coordinated with the reseal (order in
docs/gitops.md). If backends cannot connect after rotation:

1. Pause self-heal (C1).
2. Revert the live password:
   `kubectl exec -n mankahi deploy/postgres -- psql -U postgres -c "ALTER USER postgres WITH PASSWORD '<OLD-password-from-password-manager>';"`
3. Restore old `app-secrets`/`db-secrets` from the C0 snapshot.
4. `kubectl rollout restart deployment -n mankahi`.

Exposure window: seconds. Data risk: none (`ALTER USER` is transactional).

## C4 — MinIO / OCI customer-secret-key rotation gap

Preferred order (OCI permits 2 concurrent customer secret keys):
**create-new → deploy → verify presign → delete old.** Do NOT destroy the old
key before the new one is sealed and verified.

Terraform cautions (standing, re-confirmed):
- **Never run a bare `terraform apply`** — pending `user_data` drift proposes
  REPLACING both cluster nodes.
- Always `terraform plan` first; scope any apply with
  `-target=oci_identity_customer_secret_key.s3`.
- Extraction for resealing:
  `terraform output -raw object_storage_access_key` /
  `terraform output -raw object_storage_secret_key`.

Rollback: if presign breaks and the old key still exists, restore the C0
snapshot values and restart blog-service. This is why the old key is deleted
LAST.

## C5 — JWT_SECRET / SESSION_SECRET rotation

Rotating these is a **global logout by design** (all tokens invalid, all
users re-authenticate) — a scheduled event in a low-traffic window, not a
failure. If it must be reverted anyway: pause self-heal (C1), restore old
values from C0, rolling-restart all four services.

## C6 — Argo CD or sealed-secrets install misbehaves

Both installs are purely additive (own namespaces `argocd` /
`sealed-secrets`); application workloads are untouched by installation.

```bash
kubectl delete -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.4.5/manifests/install.yaml -n argocd
kubectl delete -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.38.4/controller.yaml
```

The sealed-secrets controller keypair is exported and backed up to the
password manager **immediately after install** (mandatory step in
docs/gitops.md) — so even controller loss does not mean resealing everything.

## C7 — Cutover smoke-test gate (pass before declaring success)

1. Email login works.
2. Google OAuth login works.
3. Blog post read renders.
4. Image presigned URL loads (catches the silent `minioadmin` fallback).
5. Grafana admin login works with the rotated password.

## C8 — Retiring the 3 dead plaintext Secrets (explicit, last, human-only)

Only after SealedSecrets have reconciled, the smoke gate (C7) has passed, and
the C0 snapshot is safe in the password manager:

```bash
kubectl delete secret -n mankahi redis-secrets minio-secrets elasticsearch-secrets
```

Nothing consumes them (sweep table above); this is cleanup, not migration.

## C9 — Git-level rollback (the standing mechanism)

Every Phase 4 change is one coherent commit. `git revert <sha>` on `main`
converges the cluster backward via Argo — exactly what the rollback drill
(acceptance criterion 4: revert an image-tag bump, watch the previous SHA
redeploy) rehearses before this mechanism is relied upon.

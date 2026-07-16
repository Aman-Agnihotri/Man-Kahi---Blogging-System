# OCI Deployment (Phase 3 overlay)

## 1. Overview

`kubernetes/environments/oci` is the live Kustomize overlay for the OCI Always
Free k3s cluster provisioned in Phase 2 (2x Ampere A1.Flex arm64 nodes, one
VCN, one Object Storage bucket set — see the Phase 2 Terraform under
`terraform/`). It layers image pins, resource/replica trims, storage class,
Elasticsearch single-node tuning, ingress hostnames, and object-storage config
on top of `kubernetes/base`.

Build it with plain `kubectl`:

```
kubectl kustomize kubernetes/environments/oci
```

Deployment is GitOps via Argo CD (see `docs/gitops.md`), which continuously
syncs this overlay (or its successor) from Git. Applying this overlay
directly with `kubectl apply -k` is break-glass only — see §4.

## 2. Prerequisites / placeholders to fill

All of the following MUST be replaced with real values before the first
apply. None of them may be left as-is in a live cluster.

| Placeholder | Location | Notes |
|---|---|---|
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `kubernetes/environments/oci/sealed-secrets/` | Now supplied via SealedSecrets (see `docs/gitops.md`), not `envsubst`. Values are the Terraform outputs `object_storage_access_key` / `object_storage_secret_key`. |
| `GRAFANA_ADMIN_PASSWORD` | `kubernetes/environments/oci/sealed-secrets/` | Now supplied via SealedSecrets (see `docs/gitops.md`), consumed as `GF_SECURITY_ADMIN_PASSWORD`. |

The three former fill-in-before-deploy placeholders are now resolved: the domain is
`mankahi.xyz` (with a `grafana.` subdomain) in
`kubernetes/environments/oci/patches/ingress-hosts.yaml`, the ACME contact
email is set in `kubernetes/platform/cert-manager/cluster-issuer.yaml` (both
issuers), and the frontend image SHA is pinned in
`kubernetes/environments/oci/kustomization.yaml` (see §5, §6). Only the
deploy-time secret values in the table above are now supplied via
SealedSecrets (`kubernetes/environments/oci/sealed-secrets/`, see
`docs/gitops.md`).

**`POSTGRES_USER` constraint:** the value sealed for `POSTGRES_USER` in
`db-secrets` (`kubernetes/environments/oci/sealed-secrets/`, see
`docs/gitops.md`) **must be `postgres`**. `app-secrets`' `DATABASE_URL` hardcodes the user as `postgres`
(`postgresql://postgres:${POSTGRES_PASSWORD}@postgres-service:5432/mankahi`),
and `db-secrets`' `POSTGRES_USER` overrides the `postgres-config` ConfigMap's
default (also `postgres`) for the Postgres container itself. Substituting any
other value will make the Postgres container start with a different user than
the one the backends connect as.

## 3. DNS

The primary domain is `mankahi.xyz`, registered apex via Dynadot, with its own
Let's Encrypt per-domain rate-limit quota (the shared `work.gd` quota caveat
that applied to the old third-level name no longer applies). `mankahi.work.gd`
is retained as a 301 redirect only:

Create A records for:

- `mankahi.xyz`
- `www.mankahi.xyz`
- `grafana.mankahi.xyz`
- `argocd.mankahi.xyz`

Each of the above must point at the two reserved node public IPs (terraform
outputs server_public_ip and agent_public_ip) — eight A
records total. `mankahi.work.gd` A records remain in place for the redirect.

Why both IPs: k3s ServiceLB (Klipper) fulfills the ingress-nginx `Service`
of `type: LoadBalancer` by binding ports 80/443 on **every** node, so both
node IPs serve ingress traffic identically. Pointing both A records at both
IPs is a poor-man's failover — if one node is unreachable, resolvers/browsers
can fall back to the other.

## 4. First-deploy order

**Superseded by GitOps (Phase 4).** The deployment path is now: install Argo
CD → apply the root app → everything converges with zero further `kubectl
apply` commands. Follow `docs/gitops.md` §3 (fresh-cluster bootstrap) — it
covers the Argo CD install, the SealedSecret health-check patch, DNS, the
root app, sealing, and the one-time DB seed. Platform components
(ingress-nginx, cert-manager, sealed-secrets) and the application are all
Argo-managed with sync-wave ordering; the DB-init Job runs as an Argo PreSync
hook (no manual Job deletion needed).

First-bring-up TLS note (still valid): to avoid Let's Encrypt production
rate limits on a brand-new cluster, annotate the ingresses to the staging
issuer first, verify issuance, then switch back to `letsencrypt-prod`:

```
kubectl annotate ingress -n mankahi mankahi-ingress monitoring-ingress \
  cert-manager.io/cluster-issuer=letsencrypt-staging --overwrite
# verify: kubectl get certificate -n mankahi
kubectl annotate ingress -n mankahi mankahi-ingress monitoring-ingress \
  cert-manager.io/cluster-issuer=letsencrypt-prod --overwrite
```

### Historical / break-glass note (pre-GitOps manual apply)

The pre-Phase-4 flow (envsubst-rendered Secrets + `kubectl apply -k`) is
retired: the `${VAR}` placeholder files it depended on are deleted, and a
plain apply of placeholder Secrets over live ones is exactly the incident
that motivated SealedSecrets. If Argo CD is ever unavailable and a manual
apply is unavoidable, the proven-safe order is: apply the overlay MINUS all
Secrets (filter `kind: Secret` out of the render with a small python filter),
then create the real Secrets by hand — pods wait in
`CreateContainerConfigError` until Secrets exist, which is safe by
construction. Prefer `argocd app sync mankahi` (break-glass) over any manual
apply.

## 5. Manual image-SHA update flow

There is no Argo CD Image Updater yet. CI pushes images to
`ghcr.io/aman-agnihotri/mankahi-<component>`, tagged with the full 40-character
commit SHA, on every push to `main` that touches that component's path.

To deploy a newer build of a component:

1. Find the new full-length commit SHA (the CI run / GHCR tag).
2. Edit the corresponding `newTag:` value in
   `kubernetes/environments/oci/kustomization.yaml`.
3. Commit the change.

Current pins — three distinct SHAs, not one shared SHA:

```
mankahi/auth-service        -> e69f8a881ed65a089a25a250a841d4dff100b625
mankahi/blog-service        -> f97190d2d3ca474f9277b39078ad3a5fcee01d07
mankahi/analytics-service   -> f97190d2d3ca474f9277b39078ad3a5fcee01d07
mankahi/admin-service       -> f97190d2d3ca474f9277b39078ad3a5fcee01d07
mankahi/init-service        -> f97190d2d3ca474f9277b39078ad3a5fcee01d07
frontend                    -> e74f1731bcdcb97058878764a5eb97894ac9dbbd
```

**auth+frontend atomic-contract rule:** auth-service and frontend must be
bumped together — they share the cookie flow contract (auth sets the cookie,
frontend reads it), so pinning them to mismatched SHAs risks a broken login
path. Treat their `newTag:` updates as a single change.

## 6. Frontend image

The frontend image was built via a `workflow_dispatch` CI run on `main`
(2026-07-11) and is now pinned in
`kubernetes/environments/oci/kustomization.yaml` alongside the backend
services and the init Job's image, at its own distinct SHA
(`e74f1731bcdcb97058878764a5eb97894ac9dbbd` — see §5).

The `oci` overlay's `patches/frontend-env.yaml` sets
`NUXT_PUBLIC_API_URL=https://mankahi.xyz`, so the browser's API calls are
same-origin through the ingress rather than pointing at a separate API host.

## 7. Object storage (MinIO client -> OCI S3-compatible endpoint)

Configuration lives in `kubernetes/environments/oci/app-config.yaml`, which
patches the `services-config` ConfigMap — the ConfigMap the services actually
consume via `envFrom`. The base `app-config` ConfigMap
(`kubernetes/base/config/environment.yaml`) is consumed by nothing
(investigation-verified) and is left untouched.

Values:

- `MINIO_ENDPOINT`: `bmknimruc4dp.compat.objectstorage.ap-mumbai-1.oraclecloud.com`
  (host only — the MinIO client takes port 443/SSL as separate settings,
  `MINIO_PORT: "443"` and `MINIO_USE_SSL: "true"`).
- `MINIO_REGION`: `ap-mumbai-1`.
- `MINIO_PUBLIC_URL`: `https://bmknimruc4dp.compat.objectstorage.ap-mumbai-1.oraclecloud.com`
  (the application code appends `/<bucket>/<file>` to build the final public
  URL).

**Application behavior (Phase 3.5: private buckets, presigned reads):**

The app now has two modes, gated by `MINIO_SKIP_BUCKET_SETUP`
(`backend/blog-service/src/utils/minio.ts`,
`backend/auth-service/src/utils/minio.ts`, both services' `config/env.ts`):

- **Unset / not `"true"` (local dev/compose — unchanged from before Phase
  3.5):** on first use, the service checks `bucketExists()`; if the bucket
  does not exist it calls `makeBucket()` then `setBucketPolicy(public-read)`,
  and stores an **absolute** `MINIO_PUBLIC_URL`-based URL in the database
  (`Blog.coverImage` / `User.profileImage`).
- **`"true"` (the `oci` overlay — set in `app-config.yaml`'s
  `services-config` patch):** `setupMinio()` is a no-op (bucket setup is
  skipped entirely, so `makeBucket`/`setBucketPolicy` are never called), and
  uploads store a **relative, same-origin** path instead —
  `/api/blogs/images/<key>` (blog-service) or `/api/auth/avatars/<key>`
  (auth-service). Those two endpoints resolve the key to a presigned GET URL
  (`getImageObjectUrl` / `getAvatarObjectUrl`, 1-hour expiry via
  `presignedGetObject`) against the S3-compatible endpoint and 302-redirect
  the caller to it. Buckets stay `NoPublicAccess` in this mode.

Bucket names are now configurable, not hard-coded: `MINIO_BUCKET_BLOG`
(default `blog-images`) and `MINIO_BUCKET_AVATARS` (default `avatars`) can be
set per environment; the `oci` overlay currently relies on the defaults (no
override in `app-config.yaml`).

Existing dev rows created before this change (absolute URLs) keep working
unmodified — the frontend renders whatever value is stored verbatim, and no
production data exists yet, so no data migration is needed.

**REQUIRED HUMAN STEP before first upload:** pre-create the two buckets
(named per `MINIO_BUCKET_BLOG` / `MINIO_BUCKET_AVATARS` or their defaults,
`blog-images` and `avatars`) in the tenancy's Object Storage namespace as
**private** (`NoPublicAccess`) — matching the Phase 2 Terraform intent for
`mankahi-uploads` / `mankahi-backups` — or manage them via Terraform instead
of pre-creating manually. With `MINIO_SKIP_BUCKET_SETUP=true`, the services
never call `bucketExists()`/`makeBucket()`/`setBucketPolicy()`, so the
buckets must already exist.

**Live verification (2026-07-11):** the presign mechanism itself has been
verified live against OCI — an object was uploaded to the private
`blog-images` bucket via the AWS CLI, and a `aws s3 presign` URL for that
object was fetched successfully with `curl` (HTTP 200) against the OCI
S3-compatible endpoint. What remains unverified is the in-app redirect path
(`/api/blogs/images/<key>` -> `presignedGetObject`), which must be checked on
first deploy:

1. Upload an image via the blog UI.
2. Confirm the object appears:

   ```
   aws s3 ls --endpoint-url https://bmknimruc4dp.compat.objectstorage.ap-mumbai-1.oraclecloud.com \
     s3://blog-images/
   ```

3. Confirm the image renders in the published post — this exercises the
   `/api/blogs/images/<key>` redirect and the presigned URL it points to.
4. If the redirect 404s, times out, or the presigned URL is rejected by OCI's
   endpoint, that is a blocking finding for this deploy — do not treat the
   upload path as working until this step passes.

**Operator note (AWS CLI gotcha found during the 2026-07-11 test):** AWS CLI
v2.23+ defaults to aws-chunked streaming uploads, which OCI's S3-compatible
endpoint rejects with `NotImplemented: AWS chunked encoding not supported`.
This affects `aws s3 cp` (e.g. the manual upload step above) but not the
app's MinIO SDK, which is unaffected. Fix, for the AWS CLI profile used
against this endpoint:

```
aws configure set request_checksum_calculation when_required
aws configure set response_checksum_validation when_required
```

## 8. Ingress routing

`kubernetes/base/ingress.yaml`, patched by
`kubernetes/environments/oci/patches/ingress-hosts.yaml`, routes on the
primary host (`mankahi.xyz`):

| Path | Backend service | Port |
|---|---|---|
| `/api/auth` | `auth-service` | 3001 |
| `/api/blogs` | `blog-service` | 3002 |
| `/api/analytics` | `analytics-service` | 3003 |
| `/api/admin` | `admin-service` | 3004 |
| `/` | `frontend` | 3000 |

The base `ingress.yaml`'s POC `rewrite-target` annotation, which rewrote
every incoming URI and broke backend routing, is not carried into the `oci`
overlay's ingress — backends receive the full incoming URI as-is, which is
what their own path-prefixed route handlers expect.

`monitoring-ingress`, on the separate `grafana.mankahi.xyz` host, routes
`/` to `grafana-service:3000` only. Prometheus is deliberately not exposed via
either ingress — see §10.

## 9. Database initialization (Job)

`kubernetes/base/init-job.yaml` defines a one-shot Job, `mankahi-init-db`,
running the `init-service` image (SHA-pinned in the `oci` overlay — see §5),
whose container `CMD` runs `prisma migrate deploy` / `db push`. It takes
`envFrom` both `services-config` and `secret-shared-core`. Nothing else creates the
Prisma schema in-cluster, so this Job must reach `Complete` before backend
services can work — see the first-deploy steps in §4.

This Job is now an Argo CD PreSync hook (`argocd.argoproj.io/hook: PreSync`,
`hook-delete-policy: BeforeHookCreation`), so Argo CD re-runs it
automatically on every sync — no manual `kubectl delete job mankahi-init-db`
step is needed.

## 10. Monitoring / Grafana hardening

Grafana is served on its own host, `grafana.mankahi.xyz`, at the root
path (`monitoring-ingress`, §8), rather than a subpath of the primary domain.
The `oci` overlay's `patches/grafana-auth.yaml` disables anonymous access
(`GF_AUTH_ANONYMOUS_ENABLED=false`), sources the admin password from
`grafana-secrets` (`GF_SECURITY_ADMIN_PASSWORD`, the `${GRAFANA_ADMIN_PASSWORD}`
placeholder — see §2), and sets
`GF_SERVER_ROOT_URL=https://grafana.mankahi.xyz` so Grafana generates
correct absolute links behind the ingress.

Prometheus is deliberately **not** exposed via ingress — it has no
authentication of its own. Grafana reaches it in-cluster at
`prometheus-service:9090`; there is no external route to Prometheus.

The `grafana.<domain>` DNS record from §3 must exist before first apply, or
cert-manager's ACME HTTP-01 challenge for the `grafana-tls` certificate will
fail.

## 11. Elasticsearch on small nodes

The `oci` overlay's Elasticsearch patch
(`kubernetes/environments/oci/patches/elasticsearch.yaml`) sets:

- `discovery.type=single-node`
- `ES_JAVA_OPTS=-Xms1g -Xmx1g`
- `xpack.security.enabled=false` (matches the base-mounted `elasticsearch.yml`;
  security stays off as currently configured)

Dependency: `vm.max_map_count=262144` is already set by the Phase 2
Terraform cloud-init on both nodes. If a node is ever rebuilt outside of
Terraform (manual reimage, etc.), this sysctl must be re-set manually or
Elasticsearch will fail to start.

## 12. Storage (local-path)

All three stateful PVCs use the k3s default `local-path` storage class:

| PVC | Size |
|---|---|
| `postgres-pvc` | 10Gi |
| `redis-pvc` | 2Gi |
| `elasticsearch-pvc` | 10Gi |

Trade-off, stated honestly: `local-path` volumes are node-local, which pins
each pod to the specific node holding its volume. With one replica each for
these stateful workloads, this is acceptable and is standard practice for
small k3s clusters. It also means node loss equals data loss for that volume
— there is no replication. Backups are a later phase (see `mankahi-backups`
bucket in §7).

## 13. Resource budget verification

The overlay's resource patches (`patches/resources.yaml`,
`patches/replicas.yaml`) are meant to keep total Deployment memory requests
within the Always Free node budget. Verify the current total at any time:

```
kubectl kustomize kubernetes/environments/oci | python kubernetes/environments/oci/verify-memory-budget.py
```

This script (stdlib + PyYAML) sums each Deployment's memory request x its
replica count. Budget: 6144Mi. Current total: 5120Mi.

## 14. Known issues / scan exceptions

a. `${HOSTNAME}` appears in the `elasticsearch-config` ConfigMap. This is
   Elasticsearch's own runtime variable substitution (resolved by
   Elasticsearch itself at container start), not an unresolved `envsubst`
   placeholder. It is expected to appear as-is in the rendered manifest.

b. `${VAR}`-style placeholders no longer appear in `Secret` resources (see
   §2). Done in Phase 4: they are removed by SealedSecrets — see
   `docs/gitops.md`.

c. The `development/` and `production/` overlays now build cleanly with
   `kustomize build`. Phase 3.5 (commit `a1ea385`) deleted the broken
   `app-config` `configMapGenerator` `behavior: merge` block and the
   corresponding `secretGenerator` merge blocks that previously caused a
   build failure (kustomize v5 requires a generator-produced target for a
   `merge` behavior to apply against, and the base `app-config` was a plain
   `resource`, not a generator output). The `oci` overlay was already
   unaffected (see §7). Overlay-level secret overrides for `development`/
   `production` return with Phase 4's SealedSecrets work.

d. The base's hand-rolled nginx ingress controller manifests
   (`ingress-config.yaml`, `ingress-rbac.yaml`) are excluded from the `oci`
   render via `patches/delete-ingress-controller.yaml`. The only ingress
   controller on this cluster is the platform `ingress-nginx` install
   (§4 step 1). Never apply both — running two ingress controllers on the
   same cluster will conflict over the LoadBalancer ports.

e. The base's `HorizontalPodAutoscaler` objects for `auth-service` (min 3),
   `blog-service` (min 5), `analytics-service` (min 3), and `admin-service`
   (min 2) are excluded from the `oci` render via `patches/delete-hpa.yaml`.
   HPA `minReplicas` overrides `Deployment.spec.replicas` at runtime, so
   leaving them in would push the running replica counts above the §13
   budget table's fixed values (auth 2, blog 2, analytics 1, admin 1) and
   exceed the free-tier memory budget (~7.3GB requests vs the 6144Mi cap).
   Replica counts on OCI are fixed by `patches/replicas.yaml` instead. HPA
   can be reintroduced here if the resource budget is re-planned for a
   larger node shape.

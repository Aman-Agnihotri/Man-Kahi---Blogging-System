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

There is no Argo CD yet. Applying this overlay directly with
`kubectl apply -k` is a transitional, human-driven deploy path. Phase 4
introduces Argo CD, which takes over syncing this overlay (or its successor)
from Git and retires the manual `kubectl apply -k` step described in §4.

## 2. Prerequisites / placeholders to fill

All of the following MUST be replaced with real values before the first
apply. None of them may be left as-is in a live cluster.

| Placeholder | Location | Notes |
|---|---|---|
| `${MINIO_ACCESS_KEY}` / `${MINIO_SECRET_KEY}` | `kubernetes/base/secrets/services-secrets.yaml` | `envsubst` placeholders. Values are the Terraform outputs `object_storage_access_key` / `object_storage_secret_key`. Phase 4 replaces this envsubst flow with SealedSecrets. |
| `${GRAFANA_ADMIN_PASSWORD}` | `kubernetes/environments/oci/grafana-secret.yaml` | `envsubst` placeholder for the Grafana admin password, consumed as `GF_SECURITY_ADMIN_PASSWORD`. Sealed in Phase 4 like the other secrets. |

The three former fill-in-before-deploy placeholders are now resolved: the domain is
`mankahi.work.gd` (with a `grafana.` subdomain) in
`kubernetes/environments/oci/patches/ingress-hosts.yaml`, the ACME contact
email is set in `kubernetes/platform/cert-manager/cluster-issuer.yaml` (both
issuers), and the frontend image SHA is pinned in
`kubernetes/environments/oci/kustomization.yaml` (see §5, §6). Only the
deploy-time `${VAR}`-style secret placeholders in the table above remain,
until Phase 4's SealedSecrets migration.

**`POSTGRES_USER` constraint:** the value substituted for `${POSTGRES_USER}` in
`db-secrets` (`kubernetes/base/secrets/services-secrets.yaml`) **must be
`postgres`**. `app-secrets`' `DATABASE_URL` hardcodes the user as `postgres`
(`postgresql://postgres:${POSTGRES_PASSWORD}@postgres-service:5432/mankahi`),
and `db-secrets`' `POSTGRES_USER` overrides the `postgres-config` ConfigMap's
default (also `postgres`) for the Postgres container itself. Substituting any
other value will make the Postgres container start with a different user than
the one the backends connect as.

## 3. DNS

The domain is `mankahi.work.gd`, a free domain from freedomain.one. Two
caveats worth knowing:

- Renewal is only possible within the 30 days before expiry (expires
  2027-07-11) — if that window is missed, the domain lapses and is not
  recoverable.
- It is a third-level name under the shared `work.gd` domain, so Let's
  Encrypt's per-registered-domain rate limit may be shared with other
  work.gd users. The staging-issuer-first flow in §4 step 4 mitigates the
  discovery cost of hitting that limit; if it ever becomes a real blocker,
  the fallback is to swap in another domain, which is a one-commit change
  (`patches/ingress-hosts.yaml` + `cluster-issuer.yaml` email if desired).

Create A records for:

- `mankahi.work.gd`
- `grafana.mankahi.work.gd`

Both records must point at **both** reserved node public IPs (Terraform
outputs from Phase 2) — four A records total:

- `mankahi.work.gd` -> node 1 public IP
- `mankahi.work.gd` -> node 2 public IP
- `grafana.mankahi.work.gd` -> node 1 public IP
- `grafana.mankahi.work.gd` -> node 2 public IP

Why both IPs: k3s ServiceLB (Klipper) fulfills the ingress-nginx `Service`
of `type: LoadBalancer` by binding ports 80/443 on **every** node, so both
node IPs serve ingress traffic identically. Pointing both A records at both
IPs is a poor-man's failover — if one node is unreachable, resolvers/browsers
can fall back to the other.

## 4. First-deploy order

These are all HUMAN steps, performed after `terraform apply` has completed
and `KUBECONFIG` is pointed at the new cluster.

1. Install the pinned, vendored ingress controller:

   ```
   kubectl apply -k kubernetes/platform/ingress-nginx
   ```

   (pinned v1.15.1, vendored manifests — see
   `kubernetes/platform/ingress-nginx/README.md`.)

2. Install cert-manager and wait for it to be ready:

   ```
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.21.0/cert-manager.yaml
   kubectl wait --for=condition=Ready pod -l app.kubernetes.io/instance=cert-manager -n cert-manager --timeout=180s
   ```

3. Apply the ClusterIssuer:

   ```
   kubectl apply -f kubernetes/platform/cert-manager/cluster-issuer.yaml
   ```

4. On the FIRST bring-up only, avoid Let's Encrypt production rate limits by
   pointing the ingress objects at the staging issuer first:

   ```
   kubectl annotate ingress -n mankahi mankahi-ingress monitoring-ingress \
     cert-manager.io/cluster-issuer=letsencrypt-staging --overwrite
   ```

   Verify staging certificates issue successfully (`kubectl get certificate -n mankahi`,
   `kubectl describe certificate <name> -n mankahi`), then switch back to
   production — either re-apply the overlay (which ships the prod issuer) or
   re-annotate directly:

   ```
   kubectl annotate ingress -n mankahi mankahi-ingress monitoring-ingress \
     cert-manager.io/cluster-issuer=letsencrypt-prod --overwrite
   ```

5. Render the secrets with `envsubst` (using the Terraform object storage
   outputs — see §2), apply them, then apply the overlay. This step is
   transitional and pre-Argo CD; Phase 4 replaces it with GitOps. Note the
   `${POSTGRES_USER}` constraint in §2 (must resolve to `postgres`), and that
   `kubernetes/environments/oci/grafana-secret.yaml` needs `${GRAFANA_ADMIN_PASSWORD}`
   rendered the same way:

   ```
   envsubst < kubernetes/base/secrets/services-secrets.yaml | kubectl apply -f -
   envsubst < kubernetes/environments/oci/grafana-secret.yaml | kubectl apply -f -
   kubectl apply -k kubernetes/environments/oci
   ```

6. Run the one-shot database init Job (`mankahi-init-db`, defined in
   `kubernetes/base/init-job.yaml`) to completion before expecting backend
   services to become healthy — nothing else creates the Prisma schema
   in-cluster:

   ```
   kubectl wait --for=condition=complete job/mankahi-init-db -n mankahi --timeout=180s
   ```

   This Job is not yet Argo-managed and is immutable once it reaches
   `Complete`. If you need to re-run it (e.g. re-applying the overlay after a
   schema change), delete it first:

   ```
   kubectl delete job mankahi-init-db -n mankahi
   ```

   Phase 4 replaces this manual step with an Argo CD PreSync hook.

7. Verify:

   ```
   kubectl get pods -n mankahi -w
   ```

   All pods (including frontend, once its image is built — see §6) should
   reach `Ready` within roughly 10 minutes.

   ```
   curl -vI https://<domain>
   ```

   should show a Let's Encrypt-issued certificate.

   ```
   kubectl top nodes
   ```

   should show memory usage at or below roughly 70% on each node.

## 5. Manual image-SHA update flow

There is no Argo CD Image Updater yet. CI pushes images to
`ghcr.io/aman-agnihotri/mankahi-<component>`, tagged with the full 40-character
commit SHA, on every push to `main` that touches that component's path.

To deploy a newer build of a component:

1. Find the new full-length commit SHA (the CI run / GHCR tag).
2. Edit the corresponding `newTag:` value in
   `kubernetes/environments/oci/kustomization.yaml`.
3. Commit the change.

Current pins — all four backend services, the init Job's image, and the
frontend image are all pinned to the same SHA:

```
mankahi/auth-service        -> ee0128de70760300bbb5a4a023ecbf64114b892a
mankahi/blog-service        -> ee0128de70760300bbb5a4a023ecbf64114b892a
mankahi/analytics-service   -> ee0128de70760300bbb5a4a023ecbf64114b892a
mankahi/admin-service       -> ee0128de70760300bbb5a4a023ecbf64114b892a
mankahi/init-service        -> ee0128de70760300bbb5a4a023ecbf64114b892a
frontend                    -> ee0128de70760300bbb5a4a023ecbf64114b892a
```

## 6. Frontend image

The frontend image was built via a `workflow_dispatch` CI run on `main`
(2026-07-11) and is now pinned in
`kubernetes/environments/oci/kustomization.yaml` alongside the backend
services and the init Job's image — see §5 for the current SHA.

The `oci` overlay's `patches/frontend-env.yaml` sets
`NUXT_PUBLIC_API_URL=https://mankahi.work.gd`, so the browser's API calls are
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
primary host (`mankahi.work.gd`):

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

`monitoring-ingress`, on the separate `grafana.mankahi.work.gd` host, routes
`/` to `grafana-service:3000` only. Prometheus is deliberately not exposed via
either ingress — see §10.

## 9. Database initialization (Job)

`kubernetes/base/init-job.yaml` defines a one-shot Job, `mankahi-init-db`,
running the `init-service` image (SHA-pinned in the `oci` overlay — see §5),
whose container `CMD` runs `prisma migrate deploy` / `db push`. It takes
`envFrom` both `services-config` and `app-secrets`. Nothing else creates the
Prisma schema in-cluster, so this Job must reach `Complete` before backend
services can work — see the first-deploy steps in §4.

Pre-Argo CD, this Job is immutable once completed: re-running it (e.g. after
a schema change) requires deleting it first
(`kubectl delete job mankahi-init-db -n mankahi`) before re-applying the
overlay. Phase 4 adds `argocd.argoproj.io/hook: PreSync` (with
`hook-delete-policy: BeforeHookCreation`) so Argo CD re-runs it automatically
on every sync.

## 10. Monitoring / Grafana hardening

Grafana is served on its own host, `grafana.mankahi.work.gd`, at the root
path (`monitoring-ingress`, §8), rather than a subpath of the primary domain.
The `oci` overlay's `patches/grafana-auth.yaml` disables anonymous access
(`GF_AUTH_ANONYMOUS_ENABLED=false`), sources the admin password from
`grafana-secrets` (`GF_SECURITY_ADMIN_PASSWORD`, the `${GRAFANA_ADMIN_PASSWORD}`
placeholder — see §2), and sets
`GF_SERVER_ROOT_URL=https://grafana.mankahi.work.gd` so Grafana generates
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

b. `${VAR}`-style placeholders remain **only** in `Secret` resources (see
   §2). They are removed in Phase 4 by SealedSecrets.

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

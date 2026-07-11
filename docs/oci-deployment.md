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
| `REPLACE_ME_DOMAIN` | `kubernetes/environments/oci/patches/ingress-hosts.yaml` | Appears as the primary ingress host, as `grafana.<domain>`, and in the TLS `hosts` list(s) for both. |
| `REPLACE_ME_ACME_EMAIL` | `kubernetes/platform/cert-manager/cluster-issuer.yaml` | Let's Encrypt account contact email. |
| `REPLACE_ME_FRONTEND_IMAGE_SHA` | `kubernetes/environments/oci/kustomization.yaml` | No frontend image has been built yet. See §6. |
| `${MINIO_ACCESS_KEY}` / `${MINIO_SECRET_KEY}` | `kubernetes/base/secrets/services-secrets.yaml` | `envsubst` placeholders. Values are the Terraform outputs `object_storage_access_key` / `object_storage_secret_key`. Phase 4 replaces this envsubst flow with SealedSecrets. |

## 3. DNS

Buy one domain (roughly $10/yr is sufficient). Create A records for:

- `<domain>`
- `grafana.<domain>`

Both records must point at **both** reserved node public IPs (Terraform
outputs from Phase 2).

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
   transitional and pre-Argo CD; Phase 4 replaces it with GitOps:

   ```
   envsubst < kubernetes/base/secrets/services-secrets.yaml | kubectl apply -f -
   kubectl apply -k kubernetes/environments/oci
   ```

6. Verify:

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

Current pins — all four backend services are pinned to the same SHA:

```
mankahi/auth-service        -> 9153a4948293b61684871be65da48a1d9b9e13d7
mankahi/blog-service        -> 9153a4948293b61684871be65da48a1d9b9e13d7
mankahi/analytics-service   -> 9153a4948293b61684871be65da48a1d9b9e13d7
mankahi/admin-service       -> 9153a4948293b61684871be65da48a1d9b9e13d7
```

## 6. Frontend image (currently missing)

The frontend image has never been built by CI — no commit touching the
frontend has landed since the CI workflow went live, so there is no GHCR tag
to pin. `newTag:` for `frontend` in
`kubernetes/environments/oci/kustomization.yaml` is currently
`REPLACE_ME_FRONTEND_IMAGE_SHA`.

To fix: trigger the frontend CI workflow — either via `workflow_dispatch` if
the workflow supports it, or by landing any commit that touches `frontend/`.
Once the image lands in GHCR, take the resulting full 40-character SHA and
replace the placeholder.

Until this is done, the frontend `Deployment` in the `oci` overlay will fail
to pull its image.

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

**Application behavior (as currently coded, unchanged in Phase 3):**

- The app hard-codes two bucket names: `blog-images` (used by blog-service)
  and `avatars` (used by auth-service).
- On startup/use it checks `bucketExists()`; if the bucket does not exist it
  calls `makeBucket()` and then `setBucketPolicy(public-read)`.
- The resulting public URLs are stored **permanently** in the database.
- The app uses **no presigned URLs** anywhere in this flow.

**REQUIRED HUMAN STEP before first upload:** pre-create both buckets,
`blog-images` and `avatars`, in the tenancy's Object Storage namespace with
public read access (`access_type: ObjectRead`). With the buckets already
present and already public, the app's `bucketExists()` check short-circuits
true and it never calls `makeBucket()`/`setBucketPolicy()` —
`setBucketPolicy()` is the call most likely to be unsupported (or behave
differently) against the OCI S3-compatible endpoint.

**Security note requiring ratification:** public-read buckets contradict the
Phase 2 Terraform intent. The Terraform-provisioned buckets
`mankahi-uploads` and `mankahi-backups` were created `NoPublicAccess`, with a
comment indicating a presigned-URL-or-proxy access pattern was intended. The
application's actual model — store a public URL permanently in the database —
cannot be served through presigned URLs or a proxy without a code refactor.
Phase 3 keeps the application code unchanged (per spec: this phase is
config-only; an env-gated code change is only in scope if live verification
in the next step fails). Note `mankahi-uploads` is currently unused by the
application; `mankahi-backups` is reserved for a later backups phase.

**Live verification (HUMAN, acceptance criterion 5):**

1. Upload an image via the blog UI.
2. Confirm the object appears:

   ```
   aws s3 ls --endpoint-url https://bmknimruc4dp.compat.objectstorage.ap-mumbai-1.oraclecloud.com \
     s3://blog-images/
   ```

3. Confirm the image renders in the published post.

If `makeBucket`/`setBucketPolicy` errors appear in blog-service logs (they
should not, if buckets were pre-created per the step above), the fallback is
a minimal env-gated skip flag for that code path — this is a future change,
not authored as part of Phase 3.

## 8. Elasticsearch on small nodes

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

## 9. Storage (local-path)

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

## 10. Resource budget verification

The overlay's resource patches (`patches/resources.yaml`,
`patches/replicas.yaml`) are meant to keep total Deployment memory requests
within the Always Free node budget. Verify the current total at any time:

```
kubectl kustomize kubernetes/environments/oci | python kubernetes/environments/oci/verify-memory-budget.py
```

This script (stdlib + PyYAML) sums each Deployment's memory request x its
replica count. Budget: 6144Mi. Current total: 5120Mi.

## 11. Known issues / scan exceptions

a. `${HOSTNAME}` appears in the `elasticsearch-config` ConfigMap. This is
   Elasticsearch's own runtime variable substitution (resolved by
   Elasticsearch itself at container start), not an unresolved `envsubst`
   placeholder. It is expected to appear as-is in the rendered manifest.

b. `${VAR}`-style placeholders remain **only** in `Secret` resources (see
   §2). They are removed in Phase 4 by SealedSecrets.

c. The `development/` and `production/` overlays currently fail
   `kustomize build` with a pre-existing `app-config` `configMapGenerator`
   `behavior: merge` error. This predates Phase 3: the base `app-config` is a
   plain `resource`, not a generator output, and kustomize v5 requires a
   generator-produced target for a `merge` behavior to apply against. The
   `oci` overlay deliberately avoids this pattern (see §7) and is unaffected.

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
   leaving them in would push the running replica counts above the §10
   budget table's fixed values (auth 2, blog 2, analytics 1, admin 1) and
   exceed the free-tier memory budget (~7.3GB requests vs the 6144Mi cap).
   Replica counts on OCI are fixed by `patches/replicas.yaml` instead. HPA
   can be reintroduced here if the resource budget is re-planned for a
   larger node shape.

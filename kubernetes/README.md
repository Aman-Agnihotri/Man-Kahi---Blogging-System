# ManKahi Kubernetes Manifests

Production runs on a 2-node arm64 k3s cluster (OCI Always Free) at
`mankahi.work.gd`, deployed via **GitOps**: Argo CD continuously syncs
`kubernetes/environments/oci` from `main`. There is no imperative deploy
script — merging to `main` IS the deployment.

## How to deploy

| Scenario | What you do |
|---|---|
| Local development | `docker compose` — see `docker/compose/` (Kubernetes is NOT the local dev environment) |
| Deploy to production | Merge to `main`; Argo CD auto-syncs (`prune` + `selfHeal`) |
| Break-glass manual sync | `argocd app sync mankahi` |
| Bootstrap a fresh cluster | Follow `docs/gitops.md` (install Argo CD → apply the root app → everything converges) |
| Roll back | `git revert` the offending commit on `main`; Argo converges backward |

## Directory structure

```
kubernetes/
├── base/                        # Kustomize base: namespace, infrastructure
│   │                            # (postgres/redis/elasticsearch), 4 backend
│   │                            # services, frontend, init Job (Argo PreSync
│   │                            # hook), ingress, monitoring, storage
├── environments/
│   ├── development/             # local-cluster overlay (reduced replicas/resources)
│   └── oci/                     # THE LIVE OVERLAY — image pins by git SHA,
│       │                        # per-service patches, memory budget
│       └── sealed-secrets/      # SealedSecret manifests (encrypted; safe in git)
└── platform/                    # cluster platform components (Argo Applications)
    ├── argocd/                  # pinned install docs + ingress + apps/ (app-of-apps)
    ├── cert-manager/            # vendored v1.21.0 + letsencrypt issuers
    ├── ingress-nginx/           # vendored v1.15.1 + resource patches
    └── sealed-secrets/          # vendored v0.38.4, relocated to sealed-secrets ns
```

## Secrets

Every secret in git is a **SealedSecret** (encrypted, only the in-cluster
controller can decrypt). Plaintext secrets are never committed, staged, or
templated. Sealing, rotation, and key backup: `docs/gitops.md`.

## Render checks (CI + local, no cluster needed)

```
kubectl kustomize kubernetes/environments/oci
kubectl kustomize kubernetes/environments/development
kubectl kustomize kubernetes/environments/oci | python kubernetes/environments/oci/verify-memory-budget.py   # app requests within 6144Mi
```

## Sync-wave ordering (why bootstrap converges safely)

Argo applies the app-of-apps children in waves: platform controllers
(cert-manager, ingress-nginx, sealed-secrets) at wave **-2** → SealedSecrets
for the app at wave **-1** (gated on real decryption via a custom health
check) → the application itself at wave **0** (its DB-init Job runs as a
PreSync hook). Secrets therefore always exist before any pod that needs them.

## Monitoring

Prometheus + Grafana run in-cluster (`base/monitoring.yaml`, hardened by the
oci overlay). Grafana admin credentials come from the `grafana-secrets`
SealedSecret.

## What happened to kubernetes/scripts/?

Retired in Phase 4 (GitOps). deploy.sh → Argo auto-sync; health-check.sh →
Argo health + readiness/liveness probes; backup.sh → Phase 5 CronJob;
monitor.sh → Prometheus/Grafana + Argo UI; cleanup.sh / setup-local-cluster.sh
/ setup-permissions.sh / common helpers → obsolete (local dev is Compose; the
cluster is Terraform-provisioned; no sudo wrappers needed). See the deletion
commit message for the full mapping.

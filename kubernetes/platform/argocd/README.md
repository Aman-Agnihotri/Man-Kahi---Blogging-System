# Argo CD (platform component)

## Version

Pinned: **v3.4.5**, non-HA install, namespace `argocd`, sized for the 2-node
arm64 cluster (no HA controller/repo-server/redis replicas).

## App-of-apps

`apps/app-of-apps.yaml` is the one self-managed root Application. It points
at the `apps/` directory as a directory source: every `*.yaml` dropped there
is auto-detected as a child Application, so adding a new one is a plain git
commit, not an `argocd app create`. The child Applications cover the platform
tier (`platform-ingress-nginx.yaml`, `platform-cert-manager.yaml`,
`platform-sealed-secrets.yaml`, `platform-argocd-ingress.yaml`) and the
`mankahi` tier (`mankahi.yaml`, `mankahi-secrets.yaml`, `mankahi-backups.yaml`,
`mankahi-network-policies.yaml`).

## SealedSecret health check

`argocd-cm-sealedsecret-health.patch.yaml` merge-patches `argocd-cm` with a
custom Lua health check for the `SealedSecret` kind, so a `SealedSecret`
Argo Application only reports Healthy once the controller has actually
unsealed it — this is what lets the `mankahi-secrets` Application (sync-wave
`-1`) gate downstream waves on a real reconcile instead of a false-positive
apply.

Full GitOps design and sync flow: `../../../docs/gitops.md`.

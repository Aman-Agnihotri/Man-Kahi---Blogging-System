# Argo CD (platform component)

## Version

Pinned: **v3.4.5**, non-HA install, namespace `argocd`. arm64 verified by the
prior architect batch (binding). Do NOT bump without re-verifying arm64.

> ALL commands below are **HUMAN-executed** against the live cluster. No CI/CD
> pipeline runs any of these. The agent prepares; the human runs each one.

## 1. Namespace + pinned non-HA install

```
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.4.5/manifests/install.yaml
```

## 2. Insecure server (nginx terminates TLS; Argo serves plain HTTP)

```
kubectl -n argocd patch configmap argocd-cmd-params-cm \
  --type merge -p '{"data":{"server.insecure":"true"}}'
kubectl -n argocd rollout restart deployment argocd-server
kubectl -n argocd rollout status  deployment argocd-server
```

## 3. SealedSecret custom health check (required so wave -1 gates on real reconcile)

Apply the argocd-cm merge patch shipped in this directory
(`argocd-cm-sealedsecret-health.patch.yaml`), then restart the app-controller
so the new health customization is loaded:

```
kubectl -n argocd patch configmap argocd-cm \
  --type merge --patch-file kubernetes/platform/argocd/argocd-cm-sealedsecret-health.patch.yaml
kubectl -n argocd rollout restart statefulset argocd-application-controller
```
(Manual patch, not an Argo-managed resource: Argo does not self-manage its own
install here, so argocd-cm is patched by the human at bootstrap — same
mechanism as the server.insecure patch above.)

## 4. Initial admin password + immediate rotation (argocd CLI method)

Before DNS/cert exist, log in via port-forward against the insecure server:

```
kubectl -n argocd port-forward svc/argocd-server 8080:80 &
INIT_PW=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d)
argocd login localhost:8080 --username admin --password "$INIT_PW" --plaintext
argocd account update-password \
  --current-password "$INIT_PW" \
  --new-password 'REPLACE_ME_ARGOCD_ADMIN_PASSWORD'
kubectl -n argocd delete secret argocd-initial-admin-secret   # bootstrap secret no longer needed
```
Store `REPLACE_ME_ARGOCD_ADMIN_PASSWORD` in the password manager. Full rotation
narrative also lives in `docs/gitops.md`.

## 5. DNS (HUMAN)

Create one A/CNAME record: `argocd.mankahi.work.gd` → the ingress-nginx
LoadBalancer address (same target as `mankahi.work.gd`). cert-manager issues
`argocd-server-tls` via `letsencrypt-prod` once the record resolves.

## 6. LIVE-ADOPTION PREFLIGHT (run BEFORE the platform apps sync anything)

The production cluster is LIVE. The first sync ADOPTS existing resources. A bad
ingress-nginx sync takes down ALL ingress for real users. Gate it:

```
# Apply the root app (the ONE human apply after bootstrap):
kubectl apply -n argocd -f kubernetes/platform/argocd/apps/app-of-apps.yaml

# The child Applications are created MANUAL (no auto-sync) for the platform tier.
# Diff each BEFORE syncing — expect only Argo tracking labels/annotations added:
argocd app diff platform-ingress-nginx
argocd app diff platform-cert-manager
argocd app diff mankahi

# When a diff shows ONLY additive tracking metadata (no field mutation on the
# ingress-nginx Service, no CRD spec churn), sync that app once, manually:
argocd app sync platform-cert-manager
argocd app sync platform-ingress-nginx

# Verify Synced/Healthy, then flip the platform apps to the automated end-state
# by uncommenting the `automated:` block in each manifest and committing.
```
mankahi.yaml ships automated (spec-mandated) — it was deployed from this same
oci overlay in Phase 3, so its adoption diff is expected clean; still diff it
before the first controller sync completes.

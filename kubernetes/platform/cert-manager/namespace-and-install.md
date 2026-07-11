# cert-manager (platform component)

## Version

Pinned version: `v1.21.0` (architect-verified latest, released 2026-07-08).

## arm64 support

Verified this session by an anonymous manifest-list query against quay.io for
`quay.io/jetstack/cert-manager-controller:v1.21.0`
(`GET https://quay.io/v2/jetstack/cert-manager-controller/manifests/v1.21.0`,
`Accept: application/vnd.docker.distribution.manifest.list.v2+json`, using an
anonymous pull token from
`https://quay.io/v2/auth?service=quay.io&scope=repository:jetstack/cert-manager-controller:pull`).
The returned manifest list includes a platform entry with
`architecture: arm64`, `variant: v8`, `os: linux` — arm64 is supported.

## Install (HUMAN, post-cluster)

1. Install cert-manager (creates its own `cert-manager` namespace):

   ```
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.21.0/cert-manager.yaml
   ```

2. Apply the ClusterIssuers:

   ```
   kubectl apply -f kubernetes/platform/cert-manager/cluster-issuer.yaml
   ```

All of the above is a **human** step, performed post-cluster-bring-up. Nothing
here is applied automatically by any CI/CD pipeline in this phase.

## Staging-first bring-up

`cluster-issuer.yaml` defines both `letsencrypt-staging` and
`letsencrypt-prod` ClusterIssuers. On the **first** bring-up of the cluster,
ingresses should be annotated with `letsencrypt-staging` to avoid hitting
Let's Encrypt's production rate limits while the setup is being validated.

The `oci` overlay (`kubernetes/environments/oci`) ships its ingress resources
with the `letsencrypt-prod` cert-manager annotation already set. To do a safe
staging-first bring-up, override the annotation before first apply, e.g.:

```
kubectl annotate ingress mankahi-ingress -n mankahi \
  cert-manager.io/cluster-issuer=letsencrypt-staging --overwrite
```

(or temporarily edit the annotation in the manifest before applying). Once
certificate issuance is confirmed working against the staging issuer, flip
back to `letsencrypt-prod`:

```
kubectl annotate ingress mankahi-ingress -n mankahi \
  cert-manager.io/cluster-issuer=letsencrypt-prod --overwrite
```

## Phase 4

Argo CD takes over management of cert-manager and the ClusterIssuers (and the
staging/prod annotation state) in Phase 4.

# sealed-secrets (platform component)

Bitnami Sealed Secrets controller. Decrypts `SealedSecret` CRs (committed to git,
safe to be public) into in-cluster `Secret`s. Only this controller's private key
can decrypt; the sealing is done by the human with `kubeseal` (see
`docs/gitops.md`). Agents NEVER produce `encryptedData`.

## Source

- Upstream install manifest: `https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.38.4/controller.yaml`
- Version: `v0.38.4`
- Vendored file: `controller.yaml` (unmodified, as downloaded — 11 docs)
- sha256 of vendored `controller.yaml`: `8334764279b7dc3c758ce954c5e08cbf6d959bd977db49b872b2b722a123b202`
- Controller image pin (present verbatim in the vendored file):
  `docker.io/bitnami/sealed-secrets-controller:0.38.4`
- arm64 support: confirmed for `0.38.4` (Bitnami publishes a multi-arch
  manifest list incl. linux/arm64 for this tag).

## Namespace relocation

Upstream deploys into `kube-system`. We relocate to a dedicated `sealed-secrets`
namespace via `kustomization.yaml` (`namespace: sealed-secrets` transformer +
`namespace.yaml`), for smaller blast radius and clean bootstrap/backup. The
controller's private keys therefore live as `Secret`s in the `sealed-secrets`
namespace (label `sealedsecrets.bitnami.com/sealed-secrets-key`).

Because the controller is NOT in the kubeseal default namespace, every
live-controller `kubeseal` command carries
`--controller-namespace sealed-secrets --controller-name sealed-secrets-controller`.
See `docs/gitops.md` for the exact seal / key-backup / key-restore commands.

## Upgrade discipline

1. Bump the version in the `curl` URL, re-vendor `controller.yaml` byte-verbatim
   (never hand-edit).
2. Re-run the sanity checks in the vendoring instruction (kind count 11, image
   tag, kube-system count 10) and update the sha256 above.
3. Confirm the new tag is arm64 (multi-arch manifest list) before commit.
4. `kubectl kustomize kubernetes/platform/sealed-secrets` must still relocate all
   objects cleanly. Diff the render before merging.
5. Never delete/recreate the controller as part of an upgrade — the private key
   Secret in the `sealed-secrets` namespace is irreplaceable. Losing it means
   every committed SealedSecret becomes permanently undecryptable. Back it up
   first (see `docs/gitops.md`).

## Install (bootstrap; normally Argo does this — see platform-sealed-secrets Application)

    kubectl apply -k kubernetes/platform/sealed-secrets

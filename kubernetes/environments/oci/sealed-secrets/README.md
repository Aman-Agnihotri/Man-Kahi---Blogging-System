# mankahi SealedSecrets (environment overlay)

Sourced by the `mankahi-secrets` Argo Application (sync-wave `-1`) into namespace
`mankahi`. This directory holds ONLY sealed (encrypted) SealedSecret manifests.

**Plaintext Secrets NEVER live here** — not committed, not staged, not in history.
Sealing is a human step performed with `kubeseal` against the live controller (or
its fetched public cert). Agents never produce `encryptedData`.

## Sealing workflow

See `docs/gitops.md` for the exact `kubeseal` seal command, public-cert fetch, and
controller key backup/restore. The controller runs in namespace `sealed-secrets`
(not the kubeseal default), so every command carries
`--controller-namespace sealed-secrets --controller-name sealed-secrets-controller`.

## The three SealedSecrets (strict scope)

Strict scope binds each sealed value to BOTH a name and a namespace; the plaintext
`Secret` fed to `kubeseal` must set these exactly, or the controller refuses to
unseal:

| resource file        | Secret name      | namespace |
|----------------------|------------------|-----------|
| `app-secrets.yaml`   | `app-secrets`    | `mankahi` |
| `db-secrets.yaml`    | `db-secrets`     | `mankahi` |
| `grafana-secrets.yaml`| `grafana-secrets`| `mankahi` |

## Adding them

After sealing, drop the file(s) here and uncomment/add the matching lines in
`kustomization.yaml`. Until then this overlay renders empty (exit 0) and the
`mankahi-secrets` Application is a healthy no-op.

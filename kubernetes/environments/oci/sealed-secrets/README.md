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

## The seven SealedSecrets (strict scope)

Strict scope binds each sealed value to BOTH a name and a namespace; the plaintext
`Secret` fed to `kubeseal` must set these exactly, or the controller refuses to
unseal:

| resource file             | Secret name          | namespace | holds                                          |
|----------------------------|-----------------------|-----------|-------------------------------------------------|
| `secret-shared-core.yaml`  | `secret-shared-core`  | `mankahi` | `DATABASE_URL`, `JWT_SECRET` (all backends + init) |
| `secret-auth.yaml`         | `secret-auth`         | `mankahi` | SESSION + Google OAuth + `JWT_EXPIRES` (auth)  |
| `secret-media.yaml`        | `secret-media`        | `mankahi` | MinIO access keys (auth + blog)                |
| `db-secrets.yaml`          | `db-secrets`          | `mankahi` | Postgres/Redis credentials                     |
| `grafana-secrets.yaml`     | `grafana-secrets`     | `mankahi` | Grafana admin credentials                      |
| `grafana-alerting.yaml`    | `grafana-alerting`    | `mankahi` | Grafana contact points + notification policies |
| `backup-s3-secret.yaml`    | `backup-s3-secret`    | `mankahi` | S3 keys for the backup CronJob                 |

## Adding them

The overlay ships all seven resources populated. Adding or rotating a secret
means sealing the file (starting from its matching `*.yaml.template` unsealed
stub) and ensuring it is listed under `resources:` in `kustomization.yaml`.

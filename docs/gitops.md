# GitOps: Argo CD + Sealed Secrets

`main` is the deployment mechanism. Argo CD (v3.4.5, non-HA, namespace
`argocd`) continuously syncs this repository; every secret in git is a
SealedSecret (controller v0.38.4, namespace `sealed-secrets`). All commands
in this document are **HUMAN-executed** against the live cluster
(`mankahi.work.gd` — real users; see `docs/rollback-contingencies.md` before
any destructive step).

## 1. Architecture

App-of-apps: the root Application (`kubernetes/platform/argocd/apps/app-of-apps.yaml`)
manages child Applications, ordered by sync-wave annotations on the child
Application manifests:

| Wave | Application | Source path | Sync policy |
|---|---|---|---|
| -2 | platform-cert-manager | kubernetes/platform/cert-manager | manual at first (live-adoption gate), then automated, prune:false |
| -2 | platform-ingress-nginx | kubernetes/platform/ingress-nginx | manual at first, then automated, prune:false |
| -2 | platform-sealed-secrets | kubernetes/platform/sealed-secrets | manual at first, then automated, prune:false |
| -1 | mankahi-secrets | kubernetes/environments/oci/sealed-secrets | automated, prune+selfHeal |
| 0 | mankahi | kubernetes/environments/oci | automated, prune+selfHeal, CreateNamespace |

Wave ordering is correctness, not style: SealedSecrets (wave -1) are gated on
REAL decryption by a custom health check (`argocd-cm-sealedsecret-health.patch.yaml`
maps the controller's `Synced` condition to Healthy/Degraded), so the app
(wave 0) can never sync ahead of its secrets. The `mankahi-init-db` Job runs
as a PreSync hook of the mankahi app with `hook-delete-policy:
BeforeHookCreation` (no more manual delete of the immutable Job).

## 2. Workstation tooling (Windows)

- `kubeseal` — pinned to the controller version. Download
  `kubeseal-0.38.4-windows-amd64.tar.gz` from
  `https://github.com/bitnami-labs/sealed-secrets/releases/tag/v0.38.4`,
  extract `kubeseal.exe` onto PATH. (`scoop install kubeseal` / `choco install
  kubeseal` also work but may float the version — prefer the pinned asset.)
- `argocd` CLI — download the matching v3.4.5 release binary from
  `https://github.com/argoproj/argo-cd/releases/tag/v3.4.5`.

## 3. Fresh-cluster bootstrap (zero further kubectl applies after the root app)

1. Provision infra: `terraform apply` (see `docs/oci-deployment.md` §2-3),
   point KUBECONFIG at the cluster.
2. Install Argo CD (pinned command, namespace, `server.insecure` patch):
   follow `kubernetes/platform/argocd/install.md` §1-2.
3. **Before any Application syncs**, apply the SealedSecret health-check
   patch and restart the application-controller: `install.md` §3. (If wave -1
   syncs before this patch is loaded, SealedSecrets report Healthy the moment
   the object exists and wave 0 races ahead of actual decryption.)
4. Rotate the admin password immediately: `install.md` §4. Store it in the
   password manager.
5. DNS: `argocd.mankahi.work.gd` A records to both node IPs
   (`129.154.228.139`, `130.210.11.86`) — same failover pattern as the apex.
6. Apply the root app — **the last manual kubectl apply**:

       kubectl apply -n argocd -f kubernetes/platform/argocd/apps/app-of-apps.yaml

7. Live-adoption preflight (existing cluster only): diff each platform app
   before its first sync (`install.md` §6). On a genuinely fresh cluster,
   sync the platform apps in any order; waves handle the rest.
8. Seal the secrets (section 4/6 below) — until then `mankahi-secrets` is an
   empty healthy no-op and mankahi's pods wait on their Secrets.
9. One-time DB seed (section 8) so OAuth login works on a fresh database.

## 4. Sealing workflow (never commits plaintext)

The plaintext staging file lives OUTSIDE the repo tree (e.g.
`%TEMP%\secrets-staging\`), is fed to kubeseal once, and is deleted
immediately. It is never committed, never `git add`ed, never in history.

1. Write the plaintext Secret manifest in the staging dir. It MUST carry the
   exact `metadata.name` and `metadata.namespace: mankahi` (strict scope binds
   both). Keys per secret:
   - `app-secrets`: DATABASE_URL, JWT_SECRET, JWT_ACCESS_EXPIRES_IN,
     JWT_REFRESH_EXPIRES_IN, SESSION_SECRET, GOOGLE_CLIENT_ID,
     GOOGLE_CLIENT_SECRET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
     (the raw POSTGRES_PASSWORD / MINIO_ROOT_PASSWORD / ELASTICSEARCH_PASSWORD
     keys of the legacy layout are dropped — zero code readers, verified by an
     8-agent consumption sweep)
   - `db-secrets`: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_MULTIPLE_DATABASES
   - `grafana-secrets`: GF_SECURITY_ADMIN_PASSWORD
2. Seal (against the live controller):

       kubeseal \
         --controller-namespace sealed-secrets \
         --controller-name sealed-secrets-controller \
         --scope strict \
         --format yaml \
         < %TEMP%\secrets-staging\app-secrets.plain.yaml \
         > kubernetes/environments/oci/sealed-secrets/app-secrets.yaml

   (repeat for `db-secrets`, `grafana-secrets`). Offline variant: fetch the
   cert once with `kubeseal --controller-namespace sealed-secrets
   --controller-name sealed-secrets-controller --fetch-cert` and seal with
   `--cert`.
3. Delete the staging files.
4. Uncomment the three resource lines in
   `kubernetes/environments/oci/sealed-secrets/kustomization.yaml`, commit,
   merge to main. Argo does the rest.

## 5. Controller key backup (MANDATORY — do immediately after first install)

Losing the controller keypair means resealing everything from the live values.

    kubectl -n sealed-secrets get secret \
      -l sealedsecrets.bitnami.com/sealed-secrets-key \
      -o yaml > sealed-secrets-key-backup.yaml

Store the file in the password manager (encrypted), then delete the local
copy. Restore into a rebuilt cluster:

    kubectl apply -f sealed-secrets-key-backup.yaml
    kubectl -n sealed-secrets delete pod -l name=sealed-secrets-controller

## 6. LIVE CUTOVER RUNBOOK (one-time: legacy envsubst Secrets → SealedSecrets)

The live cluster already holds plaintext Secrets with the same names, applied
manually via envsubst. The controller REFUSES to overwrite a Secret it does
not own (it sets `Synced=False` → our health check reports Degraded → wave 0
is blocked: fail-closed). The sanctioned zero-gap takeover is the
`sealedsecrets.bitnami.com/managed` annotation. Order matters — follow
exactly:

1. **C0 snapshot** (`docs/rollback-contingencies.md`): back up all six live
   Secrets + `pg_dump`, store encrypted, keep old values until the rollback
   drill passes.
2. **Generate new values** (rotation of everything previously exposed) —
   URL-safe only (a `/` in POSTGRES_PASSWORD broke Prisma live):

       python -c "import secrets; print(secrets.token_urlsafe(48))"

   New: POSTGRES_PASSWORD, JWT_SECRET, SESSION_SECRET, GRAFANA_ADMIN_PASSWORD.
   Reused unchanged: MINIO_ACCESS_KEY / MINIO_SECRET_KEY (never exposed in
   git; optional rotation in section 7). Rebuild DATABASE_URL with the new
   password: `postgresql://postgres:<NEW>@postgres-service:5432/mankahi`.
   GOOGLE_CLIENT_SECRET: rotate via console per section 7 (can follow later).
3. **Seal** all three (section 4) — do not commit yet.
4. **Pre-annotate the legacy Secrets** for in-place adoption (zero-gap):

       kubectl annotate secret app-secrets db-secrets grafana-secrets \
         -n mankahi sealedsecrets.bitnami.com/managed="true" --overwrite

5. **Commit + merge** the sealed files (+ kustomization uncomment).
6. **Wave -1 syncs**: the controller adopts and overwrites the three Secrets
   in place. Verify all three SealedSecrets show Healthy and the Secret data
   changed. Running pods still hold OLD env — do not restart anything yet,
   and proceed to step 7 promptly (a pod that self-reschedules now would read
   the new DATABASE_URL before the DB password changes and crash-loop).
7. **ALTER USER on the live DB** (postgres reads POSTGRES_PASSWORD only at
   initdb; on an existing volume the env change alone does nothing —
   `ALTER USER` is the live rotation). Confirm first that the live superuser
   role is `postgres` (if not, substitute the real role in BOTH places):

       kubectl exec -n mankahi deploy/postgres -- \
         psql -U postgres -c "ALTER USER postgres WITH PASSWORD '<NEW>';"

   Existing pooled connections keep working; only NEW connections with the
   old password fail from this instant.
8. **Immediately rolling-restart the backends** (new pods read new
   DATABASE_URL + rotated JWT/SESSION):

       kubectl rollout restart deploy/auth-service deploy/blog-service \
         deploy/analytics-service deploy/admin-service -n mankahi

   Expect: seconds of intermittent API errors at the boundary, plus the
   **by-design global logout** (all tokens invalid — schedule a low-traffic
   window). postgres itself needs NO restart.
9. **Restart Grafana** for the new admin password:
   `kubectl rollout restart deploy/grafana -n mankahi`.
10. **Smoke gate** (all must pass): email login; Google OAuth login; blog
    post renders; image presigned URL loads (catches blog's silent
    `minioadmin` fallback); Grafana login with the new password.
11. **Only now** delete the three dead legacy Secrets (nothing consumes them
    — 8-agent sweep):

        kubectl delete secret redis-secrets minio-secrets elasticsearch-secrets -n mankahi

## 7. Rotation checklist (steady-state)

Generation: always `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
Reseal = section 4 steps 1-4 for the affected secret only.

- **POSTGRES_PASSWORD**: follow section 6 steps 3-8 (ALTER USER order is the
  whole point). Update BOTH `db-secrets.POSTGRES_PASSWORD` and
  `app-secrets.DATABASE_URL`.
- **JWT_SECRET / SESSION_SECRET**: reseal app-secrets → merge → rolling
  restart all four backends. Global logout by design; low-traffic window.
- **GRAFANA_ADMIN_PASSWORD**: reseal grafana-secrets → merge → restart
  grafana (storage is emptyDir; the env password applies on every boot).
- **GOOGLE_CLIENT_SECRET**: create a NEW secret in the Google Cloud console
  (old+new stay valid together) → reseal app-secrets → merge → restart
  auth-service → verify OAuth login → delete the OLD secret in the console.
- **MINIO_ACCESS_KEY / MINIO_SECRET_KEY** (terraform-managed customer secret
  key; OCI allows 2 concurrent keys — create-before-delete): HUMAN-only.
  `terraform plan` FIRST — a bare apply currently proposes REPLACING both
  nodes (pending user_data drift). Safe form scopes AND replaces:

      terraform plan  -target=oci_identity_customer_secret_key.s3 -replace=oci_identity_customer_secret_key.s3
      terraform apply -target=oci_identity_customer_secret_key.s3 -replace=oci_identity_customer_secret_key.s3

  Extract: `terraform output -raw object_storage_access_key` /
  `object_storage_secret_key` → reseal app-secrets → merge → restart
  blog-service + auth-service → presign smoke test.
- **ELASTICSEARCH / REDIS credentials**: moot — security disabled / no auth;
  the legacy secrets were retired in Phase 4.
- **Argo CD admin password**: `kubernetes/platform/argocd/install.md` §4.
- After ANY key rotation of the sealed-secrets controller itself: re-run the
  key backup (section 5).

## 8. One-time role seed (fresh database)

On a fresh DB only email registration lazily creates the `reader` role; OAuth
login fails with "Default role not found" until it exists. Idempotent seed
(or simply register one user by email first):

    kubectl exec -n mankahi deploy/postgres -- psql -U postgres -d mankahi -c \
      "INSERT INTO roles (id, name, slug, description, \"isSystem\", priority, \"createdAt\", \"updatedAt\") \
       VALUES ('seed-reader-role', 'reader', 'reader', 'Default reader role', true, 0, now(), now()) \
       ON CONFLICT (name) DO NOTHING;"

(The proper fix — seeding inside init-service with tests — is deferred to a
dedicated backend PR; tracked in `internal-docs/phase-carryovers.md`.)

## 9. Drift test and rollback drill (acceptance criteria 3-4)

Drift test: `kubectl scale deploy/auth-service -n mankahi --replicas=5` —
selfHeal must revert to the git-declared replica count within ~5 minutes.

Rollback drill (perform once, documented): pick the latest image-tag bump
commit on main, `git revert <sha>`, merge — Argo redeploys the previous SHA.
Verify the pods run the reverted image, then revert the revert.

Break-glass: `argocd app sync mankahi`. Pause automation before any manual
surgery: `argocd app set mankahi --sync-policy none` (re-enable:
`argocd app set mankahi --sync-policy automated --auto-prune --self-heal`).
Full failure-mode catalog: `docs/rollback-contingencies.md`.

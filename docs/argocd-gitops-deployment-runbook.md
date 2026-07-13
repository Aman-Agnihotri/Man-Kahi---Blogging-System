# Argo CD + Sealed Secrets: The Complete Deployment Runbook

> A step-by-step, every-detail runbook for taking a hand-deployed Kubernetes
> application to full GitOps (Argo CD + Sealed Secrets) — distilled from a
> real production cutover on a live cluster with real users (ManKahi,
> 2026-07-13), including every mistake made and how each was caught.
> Written to be reusable on a different project: replace the angle-bracket
> placeholders; the ManKahi-specific values appear as "(e.g. ...)" examples.
>
> Prerequisites assumed: a running cluster you can reach with `kubectl`; an
> ingress controller and cert-manager already installed (or vendor them as
> platform apps first — see Design Rationale, appendix C); manifests in git
> under a kustomize overlay; container images pinned by digest/SHA in that
> overlay.

## The architecture you are building

- **App-of-apps**: one root Application, applied by hand exactly once, whose
  source directory contains child Application manifests. Everything else —
  platform controllers, secrets, the app itself — is a child app.
- **Cross-app sync waves** (`argocd.argoproj.io/sync-wave` on the CHILD
  Application metadata): platform controllers at `-2`, SealedSecrets at `-1`,
  the application at `0`. This ordering is correctness, not style: Argo runs
  an app's entire PreSync phase before ANY of its sync-phase waves, so a
  PreSync job needing a Secret can only be protected by putting the Secrets
  in a SEPARATE application at an earlier wave.
- **Sealed Secrets**: plaintext lives only in transient staging files outside
  the repo; `kubeseal` encrypts against the in-cluster controller's public
  key; only ciphertext (`encryptedData`) is committed. The controller's
  private key is the crown jewel — back it up immediately (Step 10).
- **A custom health check** so a SealedSecret only reports Healthy when the
  controller has actually decrypted it — making the wave gate real.

---

## Step 1 — Merge the GitOps manifests; CI green

All Argo/platform manifests (root app, child apps, vendored controllers,
ingress, health-check patch) are reviewed and merged to your GitOps branch
(`main`) BEFORE touching the cluster. Nothing below improvises manifests.

**Review question that will save you an incident:** for every committed
manifest, ask *"which Application applies this?"* We committed a perfectly
correct Ingress that NO app sourced — it silently never existed in the
cluster until the UI served a fake certificate.

```
# render checks before merging (no cluster needed):
kubectl kustomize <path-to-live-overlay>
kubectl kustomize <path-to-dev-overlay>
# orphan check: for each manifest path, confirm some Application's spec.source.path covers it
git grep -l "kind: Application" -- '<platform-apps-dir>/*.yaml'
```

## Step 2 — The C0 safety snapshot (before ANY cluster change)

```
# run OUTSIDE the repo tree (e.g. from $HOME):
kubectl get secret -n <app-ns> <secret-1> <secret-2> <secret-3> ... -o yaml | tee secrets-backup-$(date +%Y%m%d).yaml
kubectl exec -n <app-ns> deploy/<db> -- pg_dump -U <superuser> -d <db-name> | tee pre-rotation-$(date +%Y%m%d).sql
```

- Store both **encrypted in a password manager**, then delete local copies.
- Save them **OUTSIDE the repo tree**. "Gitignored" is one `git add -f` away
  from "committed".
- Record every CURRENT secret value in the password manager under a "legacy"
  label. You keep these until the rollback drill passes (Step 16) — they are
  your recovery path.
- NOTE for later: values in `kubectl get -o yaml` output are **base64-encoded**
  under `data:`. When you later copy a value out of this backup, you MUST
  `echo '<value>' | base64 -d` first. Pasting the encoded form into a new
  secret was one of our two live incidents.

## Step 3 — DNS for the Argo UI

Create A record(s) for `argocd.<your-domain>` pointing at the same target(s)
as your app's ingress (e.g. both node IPs on a two-node cluster). Verify with
`nslookup argocd.<your-domain> 8.8.8.8` (public resolver, in case your ISP
filters your TLD).

## Step 4 — Workstation tooling (pin everything)

- `kubeseal`: download the release asset **matching the controller version
  you will install** (e.g. `kubeseal-0.38.4-windows-amd64.tar.gz`); put the
  binary on PATH; `kubeseal --version` must match.
- `argocd` CLI: the release binary matching your server pin (e.g. v3.4.5).
- Windows/PowerShell users, learn these now (each cost us minutes live):
  - PowerShell cannot do `<` input redirection — run `kubeseal` in git-bash.
  - Inline JSON in `kubectl patch -p '{"a":"b"}'` gets mangled differently by
    PowerShell 5.1 vs 7.x — use `--patch-file` with a temp file, always.
  - `jsonpath` dots in key names need escaping: `{.data.server\.insecure}`.

## Step 5 — Install Argo CD (pinned, non-HA)

```
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/<vX.Y.Z>/manifests/install.yaml
```

Wait for all pods Running (`kubectl get pods -n argocd -w`). A restart or two
on `applicationset-controller` during startup on slow nodes is benign.

If nginx terminates TLS for you (no ssl-passthrough), switch the server to
insecure (plain HTTP behind the ingress):

```
# write '{"data":{"server.insecure":"true"}}' to insecure-patch.json first
kubectl -n argocd patch configmap argocd-cmd-params-cm --type merge --patch-file insecure-patch.json
kubectl -n argocd rollout restart deployment argocd-server
kubectl -n argocd rollout status  deployment argocd-server
```

Verify: `kubectl -n argocd get configmap argocd-cmd-params-cm -o jsonpath="{.data.server\.insecure}"` prints `true`.

## Step 6 — The SealedSecret health check (MUST precede any sync)

Apply your committed merge-patch adding a Lua health check for
`bitnami.com/SealedSecret` to `argocd-cm` (Healthy only when the controller
reports `Synced=True`; Degraded on `False`; Progressing otherwise), then
restart the application-controller — it loads health customizations only at
startup:

```
kubectl -n argocd patch configmap argocd-cm --type merge --patch-file <path-to-your-health-patch>.yaml
kubectl -n argocd rollout restart statefulset argocd-application-controller
kubectl -n argocd rollout status  statefulset argocd-application-controller
```

**Why the ordering is load-bearing**: without this, a SealedSecret reports
Healthy the instant the object exists, and your app wave races ahead of
actual decryption — pods start against Secrets that don't exist yet.

## Step 7 — Rotate the Argo admin password immediately

The initial password lives in a bootstrap secret. Rotate before anything else
listens on the network. What we learned live, encoded as procedure:

1. Run the port-forward **in its own terminal window and leave it running**
   (it blocks; running the next command in the same window kills the tunnel):
   `kubectl -n argocd port-forward svc/argocd-server 8080:80 --address 127.0.0.1`
2. Verify the tunnel is listening before using it:
   `Test-NetConnection 127.0.0.1 -Port 8080` (or `nc -z`).
3. Generate the new password INTO THE CLIPBOARD, never the screen:
   `python -c "import secrets; print(secrets.token_urlsafe(24))" | Set-Clipboard`
   — paste it into the password manager immediately.
4. If the CLI fights the tunnel ("dial proxy", connection refused), skip the
   manual tunnel entirely — the CLI can make its own:
   `argocd account update-password --port-forward --port-forward-namespace argocd --plaintext`
   (interactive prompts keep both passwords out of shell history), or simply
   use the web UI at `http://127.0.0.1:8080` → User Info → Update Password.
5. `kubectl -n argocd delete secret argocd-initial-admin-secret` — note this
   secret is a RECORD of the bootstrap password, not the credential itself;
   deleting it does not rotate anything.
6. Verify by logging out and back in with the new password.

## Step 8 — Apply the root app: the last manual kubectl apply, ever

```
kubectl apply -n argocd -f <path-to>/app-of-apps.yaml
```

Design notes baked into a good root app: `automated: {selfHeal: true,
prune: false}` (never let a transient git state cascade-delete platform
apps); a flat directory source of child Application manifests (do NOT set
`directory.recurse: false` explicitly — it is the default, and Argo
normalizes defaults off the live object, leaving the self-managed root app
permanently OutOfSync; we hit exactly this).

```
# CLI session in port-forward mode (its own tunnel; keeps a separate session context):
argocd login --port-forward --port-forward-namespace argocd --plaintext --username admin
argocd app list --port-forward --port-forward-namespace argocd --plaintext
```

Within a minute `argocd app list` shows all children. Platform apps that
manage things ALREADY RUNNING in the cluster should ship with sync policy
MANUAL (commented-out automated block) — that is your adoption gate.

## Step 9 — Adoption preflight, then manual platform syncs

For every platform app that will adopt live resources, diff BEFORE syncing:

```
argocd app diff <platform-app>    # nonzero exit when diffs exist — expected
```

```
# full flag form + capture for careful review:
argocd app diff <platform-app> --port-forward --port-forward-namespace argocd --plaintext | Out-File -Encoding utf8 diff-<platform-app>.txt

# when clean, sync in dependency order:
argocd app sync <platform-cert-manager> --port-forward --port-forward-namespace argocd --plaintext
argocd app sync <platform-ingress>      --port-forward --port-forward-namespace argocd --plaintext
argocd app sync <platform-secrets-ctrl> --port-forward --port-forward-namespace argocd --plaintext
kubectl get pods -n <controller-ns>     # controller Running before Step 10
```

**Accept**: added tracking labels/annotations; objects that exist in git but
not live (they'll be created). **Reject and investigate**: field mutations on
live Services (especially LoadBalancers with cloud-controller annotations),
controller args changes, CRD spec churn, anything REMOVING live fields.

When clean, sync in dependency order (cert-manager → ingress → secrets
controller). Manual `argocd app sync` does not prune — right for adoption.
Big-CRD controllers (cert-manager) need `syncOptions: [ServerSideApply=true]`
— client-side apply overflows the 256KB last-applied annotation.

**Known trap**: install manifests containing one-shot Jobs with
`ttlSecondsAfterFinished` (e.g. ingress-nginx admission jobs) leave the app
permanently OutOfSync after the Jobs self-delete — and under selfHeal, Argo
would recreate them forever. Fix: a kustomize patch annotating those Jobs
`argocd.argoproj.io/hook: Sync` + `hook-delete-policy: HookSucceeded` (hooks
are not tracked between syncs; re-running them is safe when they are
create-if-missing/idempotent — verify that before assuming).

## Step 10 — EXPORT THE SEALED-SECRETS CONTROLLER KEY (immediately)

The moment the controller pod first runs, it has minted the only copy of the
private key that can ever decrypt your sealed secrets:

```
kubectl -n <controller-ns> get secret -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml   # save output
```

```
# verify the backup captured something before trusting it:
grep -c "kind: Secret" <backup-file>     # must be 1 or more

# restore procedure (rebuilt cluster): apply backup, bounce controller to reload the key
kubectl apply -f <backup-file>
kubectl -n <controller-ns> delete pod -l name=<controller-name>
```

Password manager, encrypted; delete the local file. Restore procedure (fresh
cluster): apply the backup, then delete the controller pod so it reloads the
key. Losing this key = re-sealing every secret from live values.

## Step 11 — Generate rotated values

Rotate EVERYTHING that ever existed in a committed placeholder, a terminal
history, or a chat transcript. Rules learned at cost:

- **URL-safe only**: `python -c "import secrets; print(secrets.token_urlsafe(48))"`
  — a `/` in a database password broke Prisma's URL parsing in production.
- Anything you must COPY (OAuth client IDs, cloud keys) comes from the C0
  backup **base64-DECODED** (see Step 2 note).
- Values you keep (never-exposed cloud keys) are reused verbatim.
- Confirm the DB superuser role name before you plan the ALTER
  (`kubectl get secret <db-secret> -o jsonpath='{.data.<user-key>}' | base64 -d`).

```
python -c "import secrets; print(secrets.token_urlsafe(48))"   # DB password, JWT, session secrets
python -c "import secrets; print(secrets.token_urlsafe(24))"   # admin/dashboard passwords
# decode anything copied from a kubectl backup:
echo '<base64-value-from-backup>' | base64 -d
# confirm the DB superuser role before planning the ALTER:
kubectl get secret <db-secret> -n <app-ns> -o jsonpath='{.data.<user-key>}' | base64 -d
```

## Step 12 — THE CUTOVER (order is everything)

### 12a. Staging files — OUTSIDE the repo tree

One plaintext Secret manifest per secret, in e.g. `~/secrets-staging/`. Each
MUST carry the exact `metadata.name` + `metadata.namespace` the workloads
consume (strict scope seals both into the ciphertext). Drop any key nothing
reads — audit consumption first (`envFrom`/`secretKeyRef` across every
overlay, plus code-level readers).

Template (one per secret; name/namespace MUST match consumption exactly):

```
apiVersion: v1
kind: Secret
metadata:
  name: <consumed-secret-name>
  namespace: <app-ns>
type: Opaque
stringData:
  DATABASE_URL: "postgresql://<superuser>:<NEW-DB-PASSWORD>@<db-service>:5432/<db-name>"
  JWT_SECRET: "<NEW-JWT-SECRET>"
  SESSION_SECRET: "<NEW-SESSION-SECRET>"
  OAUTH_CLIENT_ID: "<current, decoded from C0>"
  OAUTH_CLIENT_SECRET: "<current, decoded from C0>"
  STORAGE_ACCESS_KEY: "<current, decoded from C0>"
  STORAGE_SECRET_KEY: "<current, decoded from C0>"
```

### 12b. LINT before sealing (both our incidents died here, one night late)

```
grep -n " @" <staging-file>              # no space before the DB-URL host — must print nothing
grep -n "[[:space:]]\"$" <staging-file>  # no trailing whitespace inside quoted values
grep -n "<expected-shape>" <staging-file>    # e.g. OAuth client id ends apps.googleusercontent.com
```

Sanity-read every value: does it LOOK like the thing it claims to be — a URL,
a client id, a key — and not like base64 of it?

### 12c. Seal (git-bash on Windows), then destroy the plaintext

```
# loop form (git-bash), one sealed file per staging file:
for s in <secret-1> <secret-2> <secret-3>; do
  kubeseal --controller-namespace <controller-ns> --controller-name <controller-name> \
    --scope strict --format yaml \
    < ~/secrets-staging/$s.plain.yaml \
    > <overlay>/sealed-secrets/$s.yaml
done
rm -rf ~/secrets-staging          # plaintext is single-use — destroy it NOW
```

### 12d. Pre-annotate the legacy live Secrets (zero-gap takeover)

The controller REFUSES to overwrite a Secret it does not own — it goes
`Synced=False` → (with Step 6's health check) Degraded → your app wave is
blocked. Fail-closed, by design. The sanctioned takeover:

```
kubectl annotate secret <name1> <name2> ... -n <app-ns> \
  sealedsecrets.bitnami.com/managed="true" --overwrite
```

Now the controller adopts and overwrites IN PLACE — the Secret object never
disappears, so no pod can ever hit CreateContainerConfigError mid-cutover.

### 12e. Commit + push the sealed files — then HARD GATE

Wire the sealed files into the secrets overlay's kustomization, push, let the
secrets app sync.

```
# kustomization wiring in <overlay>/sealed-secrets/kustomization.yaml:
#   resources:
#     - <secret-1>.yaml
#     - <secret-2>.yaml
#     - <secret-3>.yaml
git add <overlay>/sealed-secrets
git commit -m "add sealed secrets (rotated values)"
git push origin main

# force the refresh instead of waiting for the poll:
argocd app get <secrets-app> --refresh --port-forward --port-forward-namespace argocd --plaintext
```

**Do not proceed until BOTH:**

```
kubectl get secret <name> -n <app-ns> -o jsonpath='{.metadata.ownerReferences[0].kind}'   # -> SealedSecret
# and a decoded spot-check shows the NEW values (compare against C0)
```

```
# decoded spot-check (locally; do NOT paste output anywhere):
kubectl get secret <name> -n <app-ns> -o jsonpath='{.data.<some-key>}' | base64 -d
```

Running pods still hold OLD env (env is copied at container start). Do not
restart anything yet — and do not dawdle either: a pod that self-reschedules
now would read the new DB URL before the DB password changes.

### 12f. Rotate the live DB password — interactively

The DB image reads its password env var only at first initdb; on an existing
volume, `ALTER USER` IS the rotation. Type it inside psql — never paste a
runbook line containing a placeholder (a literal `<NEW-PASSWORD>` became our
production database password for 40 minutes):

```
kubectl exec -it -n <app-ns> deploy/<db> -- psql -U <superuser>
ALTER USER <superuser> WITH PASSWORD 'the-real-value';
\q
```

Know your auth model: `kubectl exec psql` rides local trust auth and NEVER
tests the password. To actually test it over TCP the way pods connect:

```
kubectl run pgtest --rm -i --restart=Never --image=postgres:<tag> -n <app-ns> \
  --env=PGPASSWORD='<value>' -- psql -h <db-service> -U <superuser> -d <db> -c "SELECT 1;"
```

From the instant of ALTER: existing pooled connections keep working; only NEW
connections with the old password fail. Move immediately to 12g.

### 12g. Rolling-restart every DB/secret consumer

```
kubectl rollout restart deploy/<svc-1> deploy/<svc-2> deploy/<svc-3> deploy/<svc-4> -n <app-ns>
kubectl rollout status deploy/<svc-1> -n <app-ns>   # repeat per service; auth-critical service first
kubectl get pods -n <app-ns> -w                     # all consumers back to Ready
```

Expect seconds of intermittent API errors at the boundary — plus a **global
logout** if you rotated JWT/session secrets (schedule a low-traffic window
and say so in the runbook you write for your team). The DB itself needs NO
restart.

### 12h. Restart anything that applies its password at boot

(e.g. Grafana with emptyDir storage re-reads its admin password env every
start.)

## Step 13 — Smoke gate (functional, not just pod-green)

Every auth path and every silent-fallback surface, explicitly:

1. Primary login (exercises DB + tokens)
2. OAuth login (exercises the IdP client id AND secret)
3. Content renders
4. **Object-storage read via presigned URL** — our blog service silently
   falls back to default credentials if storage keys are missing/wrong: no
   startup error, images just break. Find your equivalent silent fallback
   and gate on it.
5. Dashboard login with the rotated admin password.

Pods Running ≠ system working. Our pods were green while OAuth was 401 and
images were broken (Incident 2's tail).

## Step 14 — Delete the legacy/dead secrets (only now)

Anything the consumption audit proved dead, and only after the smoke gate:

```
kubectl delete secret <dead1> <dead2> ... -n <app-ns>
```

Manually-applied Secrets carry no Argo tracking — nothing deletes them
automatically; this is an explicit, deliberate step.

## Step 15 — Flip platform apps to automated

Only after adoption proved clean AND the TTL-jobs class of perpetual drift is
fixed (Step 9's trap). Uncomment the committed `automated: {prune: false,
selfHeal: true}` blocks, push, verify every app reports Auto + Synced +
Healthy. `prune: false` stays forever on anything owning CRDs or controllers:
a pruned CRD cascade-deletes every CR cluster-wide.

```
# uncomment the automated blocks in the platform Application manifests, then:
git add <platform-apps-dir>
git commit -m "enable automated selfHeal on platform apps - adoption gate passed"
git push origin main
argocd app list --port-forward --port-forward-namespace argocd --plaintext   # every app: Auto + Synced + Healthy
```

## Step 16 — Drills: prove the machinery before you rely on it

- **Drift**: `kubectl scale deploy/<svc> -n <app-ns> --replicas=<wrong>` —
  selfHeal must revert it (ours did in seconds).
- **Rollback**: `git revert` a PIN-ONLY image commit (verify with `git show`
  that the diff touches only image tags — reverting a mixed commit can
  resurrect deleted placeholder secrets or worse), push, watch the previous
  SHA deploy; then revert the revert. Expect any PreSync job to re-run on
  both syncs — with `hook-delete-policy: BeforeHookCreation` it self-replaces
  with no manual deletion.
- Both passed → purge the legacy values from the password manager. The
  rollback path is now git itself.

```
# drift:
kubectl scale deploy/<svc> -n <app-ns> --replicas=5
kubectl get deploy <svc> -n <app-ns> -w              # selfHeal reverts to the git-declared count

# rollback: find a PIN-ONLY commit (diff must touch ONLY image-tag lines):
git log --oneline -8 -- <overlay>/kustomization.yaml
git show <sha>
git revert <sha> --no-edit && git push origin main
kubectl get deploy <svc> -n <app-ns> -o jsonpath='{.spec.template.spec.containers[0].image}'   # previous SHA
git revert HEAD --no-edit && git push origin main
kubectl get deploy <svc> -n <app-ns> -o jsonpath='{.spec.template.spec.containers[0].image}'   # current SHA restored
```

## Step 17 — External IdP secret rotation + final hygiene

- OAuth secret: **create-new in the console → reseal → push → restart the
  auth consumer → verify login → delete-old in the console.** Old+new valid
  together = zero-gap.

```
# reseal just the one secret after updating the staging value (Steps 12a-12c for ONE file), then:
git add <overlay>/sealed-secrets/<name>.yaml
git commit -m "rotate OAuth client secret" && git push origin main
kubectl rollout restart deploy/<auth-svc> -n <app-ns>
# verify OAuth login BEFORE deleting the old secret in the provider console
```

- Delete every local plaintext artifact: C0 files, key-backup file, staging
  remnants, notes files. `history -c` in any shell that saw a secret.
- Calendar the things that expire: domain renewal, cert edge cases.

---

## Appendix A — Every failure we hit, so you don't

| Failure | Symptom | Root cause | Fix / prevention |
|---|---|---|---|
| Placeholder ALTER USER | All backends crash-loop, ~40 min API down | Runbook block pasted verbatim; DB password literally `<NEW-POSTGRES-PASSWORD>` | Interactive psql only (12f); never paste placeholder blocks |
| Whitespace in sealed DB URL | Crash-loop persists after correct ALTER | Stray space before `@` in staging file | Pre-seal lint (12b) |
| Base64 values sealed undecoded | OAuth 401 invalid_client; images broken; pods GREEN | `kubectl -o yaml` backup values are base64 under `data:` | Decode everything copied from backups (Step 2/11); smoke gate catches survivors |
| Orphaned committed manifest | Argo UI serves fake certificate | Ingress manifest in a directory no Application sources | Review question: "which app applies this?" (Step 1) |
| Perpetual OutOfSync platform app | App re-syncs forever under selfHeal | TTL'd one-shot Jobs self-delete | Hook-ify the Jobs (Step 9) |
| Root app permanent self-diff | app-of-apps OutOfSync after every revision | Explicit default (`recurse: false`) normalized off live object | Never commit explicit defaults on self-managed Argo resources (Step 8) |
| Verification script false pass | Budget check printed passing `TOTAL: 0Mi` | Script reads stdin; ran without the pipe | Pipe the render in; treat "0 of anything" as suspicious |
| CLI can't reach server | "dial proxy", connection refused | Port-forward not running / killed by next command in same window | Dedicated window; `Test-NetConnection`; or CLI `--port-forward` mode (Step 7) |
| Secrets backup inside repo tree | One `git add -f` from committing prod secrets | Convenience save into a gitignored repo dir | Stage plaintext OUTSIDE the tree, always (Step 2) |

## Appendix B — Windows/PowerShell quirks cheat-sheet

- No `<` input redirection in PowerShell → git-bash for kubeseal.
- Inline JSON patches mangled → `--patch-file` always.
- jsonpath key dots → `{.data.server\.insecure}`.
- Generate secrets to clipboard (`| Set-Clipboard`), never to screen — and
  never paste values into a chat/ticket; treat any that leak as exposed and
  rotate again (we did, same night).
- Base64 decode one-liner: `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("<b64>"))`
  (PowerShell) or `echo '<b64>' | base64 -d` (git-bash) — and never run it
  with the placeholder still in it.

## Appendix C — Design rationale (the "why" behind the shape)

- **Waves across apps, not within**: PreSync runs before all sync-phase
  waves of the same app — a secrets-dependent PreSync job forces the secrets
  into their own earlier-wave Application.
- **Custom SealedSecret health**: makes "secrets synced" mean "secrets
  DECRYPTED", which is what the wave gate actually needs; also makes a
  refused takeover fail-closed (Degraded blocks the app wave).
- **prune:false on root + platform**: a transient git state must never
  cascade-delete controllers or CRDs; app-level prune:true is fine because
  the app's resources are wholly git-defined.
- **Manual-first platform apps**: adoption of live infrastructure deserves a
  human diff gate exactly once; the automated end-state ships committed but
  commented, flipped only after clean adoption.
- **Vendor controllers byte-verbatim + kustomize patches**: upgrades become
  visible diffs; never hand-edit vendored files; relocate namespaces with the
  `namespace:` transformer (it rewrites RBAC ServiceAccount subjects too —
  verify in the render, count the leftovers).
- **Takeover-by-annotation over delete-first**: keeps the Secret object
  continuously present; delete-first opens a CreateContainerConfigError
  window you don't control under automated sync.

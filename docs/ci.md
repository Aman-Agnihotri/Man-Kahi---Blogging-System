# CI: GitHub Actions → GHCR

The pipeline (`.github/workflows/ci.yml`) builds, tests, scans, and publishes
SHA-tagged multi-arch container images for **only the components affected by a
change**. It replaces the old `registry.mankahi.local`.

## Triggers

| Event | What runs |
|---|---|
| `push` to `main` | Test + build + **push** + scan for affected components |
| `push` tag `v*` | Test + build + push + scan for **all** components (semver-tagged) |
| `pull_request` → `main` | Test + build for affected components (single-arch `amd64`, **no push**, no scan) |
| `workflow_dispatch` | Full run for **all** components |

**Change detection** (`dorny/paths-filter`) maps paths to components. Special
rules:

- A change under `backend/shared/**` or `.github/workflows/**` rebuilds **all
  five backend components** (they compile against `backend/shared`).
- A tag push (`v*`) or a manual `workflow_dispatch` builds **everything**.

Components: `auth-service`, `blog-service`, `analytics-service`,
`admin-service`, `init-service`, `frontend`. Only the four services have test
suites; `init-service` is build-only and `frontend` runs a Nuxt build as a
smoke test.

## Image naming & tagging (spec §0.1.2)

Images: `ghcr.io/aman-agnihotri/mankahi-<component>` (all lowercase).

Every push to `main` produces **two tags**:

- the full 40-char git SHA (e.g. `:1a2b3c…` — 40 chars, no `sha-` prefix), and
- `main`.

Git tags `v*` additionally produce the **semver** tag (e.g. `v1.4.0` → `1.4.0`).

There is **no `latest` tag**, and no Kubernetes manifest ever references one —
overlays pin images by the full SHA tag.

## Pulling images

```sh
docker pull ghcr.io/aman-agnihotri/mankahi-auth-service:<full-sha>
docker pull ghcr.io/aman-agnihotri/mankahi-auth-service:main

# Verify multi-arch:
docker manifest inspect ghcr.io/aman-agnihotri/mankahi-auth-service:<full-sha>
# -> should list both linux/amd64 and linux/arm64 entries.
```

## One-time HUMAN setup (cannot be automated)

After the first successful `main` run, each GHCR package must be linked to the
repository and made public so the k3s cluster can pull without an image pull
secret:

1. GitHub → your profile/org → **Packages** → open each `mankahi-*` package.
2. **Package settings** → **Manage Actions access** → confirm this repository is
   linked.
3. **Package settings** → **Danger Zone** → **Change visibility** → **Public**.

Repeat for all six packages once they exist. Until this is done, images are
private and the cluster cannot pull them.

## Documented pitfalls

- **QEMU arm64 build slowness.** Multi-arch Node builds run the arm64 layers
  under QEMU emulation (`npm ci` native-module compiles are the slow part,
  ~10–15 min/image). GHA cache is scoped per component (`scope=<name>`,
  `mode=max`) to keep re-runs fast. **Future option (not built now):** if a
  build exceeds ~25 min, split `linux/amd64` and `linux/arm64` into parallel
  jobs on native/emulated runners with a `docker manifest`-merge step.
- **`jest --runInBand`.** The service test suites run serially on purpose
  (shared in-process test state). **Do not** parallelize tests in CI or add
  `--maxWorkers`.

## Future toggle: fail on CRITICAL vulnerabilities

The Trivy scan is currently **report-only**: `exit-code: 0`, results uploaded
as SARIF to the repository **Security** tab (per-component category, so runs
don't overwrite each other). To make CRITICAL findings **block** the pipeline,
change the scan step in `ci.yml`:

```yaml
        with:
          severity: CRITICAL,HIGH
          exit-code: '1'   # was '0'
```

(Consider limiting the failing severity to `CRITICAL` to avoid blocking on
HIGH-only findings.) Not enabled in the first merge.

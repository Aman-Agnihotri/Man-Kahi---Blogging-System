# ManKahi Kubernetes Manifests

**Status: scaffolding, not the current deployment target.** The project's
actual deployment path is Docker Compose (`docker/compose/`, see
[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)) - single-server first, with
Kubernetes as a documented future migration point once traffic or
operational needs justify it (see
[docs/SCALING.md](../docs/SCALING.md#when-to-move-from-compose-to-kubernetes)).
These manifests exist so that migration isn't a from-scratch effort, but
they have not been applied to a real cluster as part of this project.

## Architecture

- **Auth Service**: authentication and authorization
- **Blog Service**: blog posts and content
- **Analytics Service**: view/read/click tracking
- **Admin Service**: moderation and admin-facing analytics

Supporting infrastructure: PostgreSQL, Redis, Elasticsearch, Prometheus,
Grafana - mirroring the same services the Docker Compose stack runs.

## Directory Structure

```
kubernetes/
├── base/                    # Base manifests (namespace, storage, config,
│                             # secrets, infrastructure, services, ingress,
│                             # monitoring) - builds standalone via
│                             # `kubectl kustomize base`.
├── environments/             # Environment-specific overlays (development,
│   ├── development/          # production) - each merges into base's
│   └── production/           # ConfigMaps/Secrets and sets replica counts,
│                              # resource limits, and image tags per env.
├── scripts/                  # deploy.sh, backup.sh, health-check.sh, etc.
└── dashboards/                # Grafana dashboard JSON (base/dashboards/)
```

There used to be a second, parallel `overlays/` directory attempting the
same job as `environments/` with a different mechanism (`namePrefix`
instead of generator merges). It's archived at `overlays.archived/` -
`environments/` is now the single canonical path, and `deploy.sh` only
references that one. `overlays.archived/`'s `namePrefix: dev-` approach
was also independently broken: it renames every Service object (e.g.
`redis-service` -> `dev-redis-service`) but `base/config.yaml` hardcodes
the unprefixed names into `REDIS_HOST`/`ELASTICSEARCH_NODE` - only two of
several hardcoded service hostnames had ad-hoc overrides, so it would
have silently broken database/search connectivity for anything else.

## Known Limitations (fixed some issues, one remains)

Fixed in this pass:
- `base/kustomization.yaml` had a `configMapGenerator` for a `shared-config`
  ConfigMap sourced from a `base/.env` file that never existed (`kustomize
  build` failed immediately) - and nothing even referenced the
  `shared-config` name it would have produced. Removed; it was dead
  weight, not a real dependency.
- `base/kustomization.yaml`'s `resources:` list referenced
  `services/auth.yaml` (an incomplete file with only the auth-service
  Deployment/Service/HPA) instead of the actual complete `services.yaml`
  (all four backend services) - meaning blog-service, analytics-service,
  and admin-service had no Kubernetes objects at all. Fixed to reference
  `services.yaml`; the incomplete `services/` directory was removed
  (its useful Prometheus scrape annotations were merged into
  `services.yaml` rather than lost).
- All four service Deployments in `services.yaml` referenced
  `secretRef: {name: services-secret}`, which didn't exist anywhere - the
  actual combined app secret is named `app-secrets`
  (`base/secrets/services-secrets.yaml`). Fixed the name mismatch.
- `deploy.sh` checked for `../environments/$ENVIRONMENT/secrets.yaml` but
  actually built and applied `../overlays/$ENVIRONMENT` - two different,
  incompatible directory trees cross-wired together, so even a correctly
  prepared secrets file would never have been used. Fixed `deploy.sh` to
  build `environments/$ENVIRONMENT` consistently, matching its own
  secrets check and matching which tree survived the `overlays/` archival
  above.
- `base/config.yaml`'s `services-config` ConfigMap never set
  `ENABLE_METRICS`, so - same bug found and fixed in Docker Compose's env
  files - every service's `/metrics` route would 404 and the
  `prometheus.io/scrape` annotations (added to each Deployment as part of
  this pass) would have nothing to scrape. Fixed.

Confirmed via `kubectl kustomize base` (bundles a compatible `kustomize`
binary) - the base layer now builds cleanly end-to-end with no errors.

**Still broken, not fixed in this pass:** `environments/development` (and
presumably `production`) fail to build with `kubectl kustomize
environments/development`:
```
error: merging from generator ...: id ... ConfigMap ... Name:"app-config" ...
does not exist; cannot merge or replace
```
`environments/*/kustomization.yaml` uses `configMapGenerator: {name:
app-config, behavior: merge, ...}` to layer environment-specific values
onto base's `app-config` ConfigMap - but base's `app-config`
(`base/config/environment.yaml`) is a plain static resource, not itself
produced by a generator, and this version of kustomize (bundled with
`kubectl` v1.36 / kustomize v5.8.1) requires a merge target to have
originated from a generator. Fixing this properly means restructuring
`base/config/environment.yaml`'s `app-config` to be generator-produced
too (and doing the same for the `secretGenerator: {behavior: merge}`
entries a few lines below, which likely have the identical problem against
`base/secrets/services-secrets.yaml`'s plain Secret resources, though that
wasn't reached/confirmed since the ConfigMap error surfaces first). This
is a real restructuring task, not a one-line fix, and is being left as
an explicit follow-up rather than attempted under this pass's time
budget - tracked in `docs/ACTION_PLAN.md`.

## Setup (once the environments/ build issue above is fixed)

```bash
# Copy the secrets template and fill in real values (never commit the
# result - kubernetes/environments/*/secrets.yaml is gitignored)
cp kubernetes/environments/development/secrets.example.yaml \
   kubernetes/environments/development/secrets.yaml
nano kubernetes/environments/development/secrets.yaml

cd kubernetes/scripts
./deploy.sh -e development -a apply
```

## Monitoring

- Grafana: `http://monitoring.mankahi.local/grafana` (dev) once deployed
- `./scripts/monitor.sh -c metrics|health|logs|pods|resources`

## Scaling

Replica counts and resource requests/limits are set per-environment via
`environments/*/kustomization.yaml`'s `patchesJson6902` blocks - edit
those and redeploy rather than editing `base/services.yaml` directly,
so `base/` stays environment-agnostic.

## Security Notes

1. Never commit `environments/*/secrets.yaml` (only the `.example.yaml`
   templates belong in version control).
2. Enable network policies before any real deployment.
3. Use TLS for all public-facing services.
4. Regularly update container images and dependencies.

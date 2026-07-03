# ManKahi Deployment

Last updated: 2026-06-02

## Deployment Strategy

ManKahi currently has one supported deployment path and two future/experimental paths.

| Mode | Status | Purpose |
| --- | --- | --- |
| Local Docker Compose | Supported now | Development and laptop demo |
| Cloudflare Tunnel | Supported now | Temporary public exposure of the local gateway |
| Single-server production Compose | Config validates; runtime testing pending | Real VPS/home-server deployment after hardening |
| Kubernetes | Future/scaffolding | Not the current deployment target |

## Local Development

### Prerequisites

- Docker Desktop or Docker Engine
- Docker Compose v2
- Available local ports: `8080`, `3000-3005`, `5432`, `6379`, `9000`, `9001`, `9200`, `9090`

### Environment

The development compose file expects:

```text
docker/compose/.env.development
```

For a fresh setup:

```bash
cd docker/compose
cp .env.example .env.development
```

Then update the values in `.env.development`.

Do not commit real env files. The repository ignores `.env` and `.env.*` files.

### Start The Stack

```bash
cd docker/compose
docker compose up -d --build
```

The stack includes:

- nginx gateway
- frontend
- auth service
- blog service
- analytics service
- admin service
- Postgres
- Redis
- Elasticsearch
- MinIO
- Prometheus
- Grafana

### Access The App

Use nginx as the app entrypoint:

```text
http://localhost:8080
```

Direct service ports are bound to localhost for development, but the gateway should be the normal access path.

### Smoke Test The Core Loop

After the stack is up and healthy, exercise the full register → login →
create → publish → view-by-slug → edit → appears-in-my-stories → delete
loop against the gateway with one command:

```bash
cd docker/compose
../scripts/smoke-test.sh
```

Set `SMOKE_TEST_BASE_URL` if the gateway isn't at the default
`http://localhost:8080`.

### Check Status

```bash
cd docker/compose
docker compose ps
```

For all running containers:

```bash
docker ps
```

### View Logs

```bash
cd docker/compose
docker compose logs -f
```

For one service:

```bash
docker compose logs -f blog-service
```

### Rebuild One Service

```bash
cd docker/compose
docker compose up -d --build blog-service
```

### Stop The Stack

```bash
cd docker/compose
docker compose down
```

### Reset Local Data

This deletes local Docker volumes for the Compose project.

```bash
cd docker/compose
docker compose down -v
docker compose up -d --build
```

Use this only when you are okay losing local database/search/cache/upload data.

## Laptop Public Demo With Cloudflare Tunnel

The local stack can be exposed through Cloudflare Tunnel while still keeping internal services private.

Start the app first:

```bash
cd docker/compose
docker compose up -d --build
```

Then start a quick tunnel to nginx:

```bash
docker run --rm --name mankahi-tunnel cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:8080
```

Notes:

- This quick tunnel is temporary.
- Cloudflare will print a public URL.
- The tunnel points to nginx only.
- Do not point a public tunnel directly to Postgres, Redis, Elasticsearch, MinIO, or individual app services.

For a stable domain, use a named Cloudflare Tunnel and route the domain to the same nginx gateway.

For private operational surfaces such as Grafana, prefer SSH access, VPN access, or Cloudflare Access in front of a protected route. Do not publish observability tools directly to the open internet.

## Single-Server Production Target

Single-server production is the next deployment milestone, but the current production Compose file still needs hardening before it should be used publicly.

Target behavior:

- nginx exposes `80` and `443`
- internal services are private
- Postgres, Redis, Elasticsearch, MinIO, Prometheus, and Grafana are not publicly exposed
- env values come from a production env file
- all containers use production commands
- restart policies are enabled
- persistent volumes are used
- backup and restore scripts exist

Create a production env file from the template:

```bash
cd docker/compose
cp .env.production.example .env.production
```

Replace every placeholder in `.env.production`, especially secrets, passwords, `PUBLIC_APP_URL`, `FRONTEND_URL`, `SITE_URL`, `CORS_ORIGIN`, and `GOOGLE_CALLBACK_URL`.

Also edit `docker/nginx/nginx.conf`'s `map $http_origin $cors_allowed_origin` block to add your real production domain(s) - this is separate from the `CORS_ORIGIN` env var above (that one governs each backend service's own CORS check; this one governs the nginx gateway's, which is what a browser actually talks to). Nginx isn't templated from env vars in this setup, so it needs a direct edit. Leaving it as just `localhost`/`127.0.0.1` means any cross-origin request from your real domain gets silently rejected by the browser.

Validate the production Compose config with:

```bash
cd docker/compose
MANKAHI_ENV_FILE=.env.production docker compose -f docker-compose.prod.yml --env-file .env.production config --quiet
```

Expected production startup command:

```bash
cd docker/compose
MANKAHI_ENV_FILE=.env.production docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Expected production update command after pulling new code:

```bash
cd docker/compose
MANKAHI_ENV_FILE=.env.production docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans
```

Current production Compose status:

- config validation passes with `.env.production.example`
- only nginx publishes host ports
- internal app and infrastructure services stay on Docker networks
- fake `deploy.replicas` settings have been removed for single-server mode
- Elasticsearch and MinIO settings match the current app configuration

Remaining production work:

- runtime-test the production stack on a clean machine
- verify production Dockerfiles start every service correctly
- decide how Grafana should be accessed privately
- configure real TLS/domain behavior for nginx or Cloudflare

## Backups And Restore

### PostgreSQL (primary data - back this up)

```bash
# Back up (writes a timestamped .dump file to docker/backups/ by default)
docker/scripts/backup-postgres.sh -e development
docker/scripts/backup-postgres.sh -e production

# Restore (destructive - drops and recreates objects covered by the dump)
docker/scripts/restore-postgres.sh docker/backups/mankahi-development-20260702-120000.dump -e development
```

Both scripts read `POSTGRES_USER`/`POSTGRES_DB` from inside the running
container itself (already set there via `env_file`), so they work
identically regardless of which env file started the stack. Backups use
`pg_dump --format=custom` (`restore-postgres.sh` expects that format).

Where backups are stored: `docker/backups/` by default (gitignored - never
commit real data), or pass `-o <dir>` to write elsewhere (e.g. a mounted
network share or object storage sync target). How often: no automated
schedule exists yet - run `backup-postgres.sh` on a cron/scheduled task
appropriate to your acceptable data-loss window (daily is a reasonable
starting point for a single-server deployment).

**Verification status (2026-07-02):** tested end-to-end against a real
Docker daemon. Took a backup of a running stack's seeded data (4 users, 3
blogs), ran `docker compose down` followed by `docker volume rm
<project>_postgres-data` for a genuinely fresh volume (not just `down -v`
on the whole stack, to leave Elasticsearch/Redis/MinIO data untouched),
brought the stack back up (`init-db` recreated the schema with no manual
steps, confirmed 0 rows), ran `restore-postgres.sh --force`, and confirmed
every row came back identical. The app itself was re-verified working
correctly against the restored data afterward via a full browser
click-through.

### Redis (cache/session data - safe to lose, persistence is a nice-to-have)

Already configured with AOF persistence (`redis-server --appendonly yes`,
see `docker-compose.yml`) writing into the `redis-data` named volume, so a
container restart doesn't lose the rate-limit counters/token blacklist/
cache. Redis holds no data that isn't reconstructable from Postgres or
that would be catastrophic to lose (worst case: users need to log in
again, caches repopulate on next read), so it is intentionally not
included in the backup script above.

### Elasticsearch (search index - rebuildable from Postgres)

No snapshot repository is configured. This is acceptable because the
search index is fully rebuildable from Postgres: blog-service's
`syncBlogsToElasticsearch()` (`backend/blog-service/src/utils/elasticsearch.ts`)
re-indexes every blog from the database in batches. If the `es-data`
volume is ever lost, recreate the index and re-run that function (there is
currently no CLI entrypoint wired up for it - it needs to be invoked from
a one-off script or a temporary route; a small `npm run reindex` script is
a reasonable Phase 5+ follow-up).

### MinIO / uploaded cover images

Cover images live in the `minio-data` named volume. For a single-server
deployment, back it up the same way as any other Docker named volume, e.g.:

```bash
docker run --rm -v mankahi-dev-compose_minio-data:/data -v "$(pwd)/docker/backups":/backup alpine \
  tar czf /backup/minio-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

(Confirm the exact volume name with `docker volume ls` - Compose prefixes
it with the project name, which differs between the dev and prod compose
files.) Restoring is the reverse: stop the `minio` container, extract the
tarball back into the volume, restart.

## Kubernetes Status

Kubernetes manifests exist, but they are not the current supported deployment path (see `kubernetes/README.md` for the full picture).

Fixed (2026-07-03): the missing `kubernetes/base/.env` reference, the
duplicate `overlays/`/`environments/` trees (consolidated to
`environments/`, `overlays/` archived), `services.yaml` never being wired
into `base/kustomization.yaml` (three of four backend services had no
Kubernetes objects at all), and a secret-name mismatch
(`services-secret` vs the real `app-secrets`). `kubectl kustomize base`
now builds cleanly.

Still outstanding:

- `kubectl kustomize kubernetes/environments/development` fails: its
  `configMapGenerator`/`secretGenerator` `behavior: merge` entries target
  base ConfigMaps/Secrets that are plain static resources rather than
  generator-produced ones, which this kustomize version rejects. Needs a
  restructure of `kubernetes/base/config/environment.yaml` and
  `kubernetes/base/secrets/services-secrets.yaml` to originate from
  generators too - see `kubernetes/README.md`'s Known Limitations section
  for the exact error and fix direction.
- Stateful components are modeled as basic Deployments and PVCs, not production-grade StatefulSets/operators/clusters.

Kubernetes should be repaired further after Docker Compose production is stable, if/when a real migration is warranted (see `docs/SCALING.md`).

## Operational Checklist

Before exposing the app publicly:

- [ ] only nginx is public
- [ ] production env file uses strong secrets
- [ ] real secrets are not committed
- [ ] backups are configured
- [ ] restore has been tested
- [ ] health checks pass
- [ ] logs are accessible
- [ ] metrics are scraped
- [ ] CORS matches the public domain
- [ ] rate limits do not break normal usage
- [ ] admin routes require admin permissions

Progress is tracked in [ACTION_PLAN.md](ACTION_PLAN.md).

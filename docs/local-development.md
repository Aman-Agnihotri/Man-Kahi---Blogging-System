# Local Development (Docker Compose)

## Deployment Strategy

| Mode | Status | Purpose |
| --- | --- | --- |
| Local Docker Compose | Supported now | Development and laptop demo |
| Cloudflare Tunnel | Supported now | Temporary public exposure of the local gateway |
| Single-server production Compose | Config validates; runtime testing pending | Real VPS/home-server deployment after hardening |
| Kubernetes (k3s/OCI) | Production | see docs/oci-deployment.md |

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

Live-verified: with the stack running, the command above printed a public `https://*.trycloudflare.com` URL, and both the homepage and an API health check loaded correctly through it.

If cloudflared's connectivity pre-check reports QUIC/UDP as blocked (common on networks or firewalls that don't allow outbound UDP on port 7844) and the tunnel keeps retrying without ever registering a connection, add `--protocol http2` to the command to force the TCP-based fallback instead of waiting on QUIC:

```bash
docker run --rm --name mankahi-tunnel cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:8080 --protocol http2
```

For a stable domain, use a named Cloudflare Tunnel and route the domain to the same nginx gateway.

For private operational surfaces such as Grafana, prefer SSH access, VPN access, or Cloudflare Access in front of a protected route. Do not publish observability tools directly to the open internet.

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
re-indexes every blog from the database in batches. If the `es-data` volume
is ever lost, bring Elasticsearch back up and trigger a rebuild with the
admin endpoint `POST /api/blogs/search/reindex` (admin auth; responds `202`
and rebuilds in the background, `409` if a rebuild is already running,
`503` if Elasticsearch is unreachable).

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

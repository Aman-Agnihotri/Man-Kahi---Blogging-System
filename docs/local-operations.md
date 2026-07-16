# Compose Operations (local stack)

Day-to-day operational commands for a running ManKahi Docker Compose stack.
All commands below assume you're in `docker/compose/` and use the
development stack (`docker-compose.yml`); swap in `-f docker-compose.prod.yml`
for production. See [local-development.md](./local-development.md) for first-time setup
and [alerting.md](./alerting.md) for what to watch and when to act.

## Check what's up

```bash
docker compose ps
```
Look at the `STATUS` column: `healthy`/`Up` is good, `unhealthy` or a
container stuck restarting needs attention. Every service (auth, blog,
analytics, admin, nginx, frontend, Postgres, Redis, Elasticsearch, MinIO,
Prometheus, Grafana) has a healthcheck wired in, so this one command tells
you almost everything at a glance.

```bash
./docker/scripts/health-check.sh -e development   # deeper compose health check
```

## View logs

```bash
docker compose logs <service> --tail 100          # last 100 lines
docker compose logs <service> -f                  # follow live
docker compose logs <service> --since 30m         # last 30 minutes
```

Logs are structured JSON under the hood (Pino), rendered pretty on stdout.
Every line carries a `service` field (which container emitted it) and
request-scoped calls carry a `reqId` field you can grep for to follow one
request through a service's full lifecycle:

```bash
docker compose logs auth-service | grep '\[abc123\]'
```

Container logs are also capped and rotated by Docker itself
(`json-file` driver, `max-size: 100m` / `max-file: 3` in dev,
`200m` / `5` in prod - see each service's `logging:` block in
`docker-compose.yml`) so `docker compose logs` never grows unbounded on disk.

Each backend service additionally writes its own rotating file log inside
its container at `/app/<service>/logs/pino/` (14-day retention, gzip
after a day, `pino-rotating-file-stream`). Reach it directly if you need
history beyond what Docker's log driver retained:

```bash
docker exec mankahi-auth sh -c "ls /app/auth-service/logs/pino"
docker exec mankahi-auth sh -c "cat /app/auth-service/logs/pino/server-$(date +%F).log"
```

nginx's access/error logs persist in the named volume `nginx-logs`, mounted
at `/var/log/nginx` inside the nginx container - they survive container
restarts and recreates (the volume, not the container, is what persists):

```bash
docker exec mankahi-nginx sh -c "tail -f /var/log/nginx/access.log"
docker exec mankahi-nginx sh -c "tail -f /var/log/nginx/error.log"
```

## Restart a service

Plain restart (keeps the same container, same `/tmp`, fastest):
```bash
docker compose restart <service>
```
Use this for a hung process or to pick up an environment change that
doesn't require rebuilding the image.

**Known gotcha:** nginx caches upstream container IPs at worker startup.
If you recreate (not just restart) a backend service, nginx will keep
routing to the old, now-dead IP until it's restarted too:
```bash
docker compose restart nginx
```
Do this any time you `--force-recreate` auth/blog/analytics/admin/frontend
and then see unexpected 502s through the gateway.

Full recreate (fresh container, fresh `/tmp`, picks up new env vars or a
changed image):
```bash
docker compose up -d --force-recreate <service>
```
Env var changes in `docker-compose.yml`/`docker-compose.prod.yml` (e.g.
adding `SERVICE_NAME=...`) only take effect on a real recreate, not a
plain restart - Docker sets env vars at container creation time.

Rebuild the image after a Dockerfile or dependency change:
```bash
docker compose up -d --build <service>
```

## Backup

```bash
cd docker/scripts
./backup-postgres.sh -e development                 # writes to docker/backups/
./backup-postgres.sh -e production -o /path/to/dir   # custom output dir
```
Uses `pg_dump --format=custom` inside the running Postgres container, so it
always reflects live data with no separate export step. Run this before any
risky migration, restore test, or manual data surgery.

Redis and Elasticsearch are intentionally not backed up: Redis holds
reconstructable/expendable cache data (AOF persistence is on for crash
recovery only, not disaster recovery), and the Elasticsearch index is fully
rebuildable from Postgres via `syncBlogsToElasticsearch()` (trigger it with
the admin endpoint `POST /api/blogs/search/reindex`). Uploaded files
(cover images) live in the `blog-uploads` named volume / MinIO bucket -
back that up separately if it holds content you can't regenerate.

## Restore

```bash
cd docker/scripts
./restore-postgres.sh /path/to/backup.dump -e development
./restore-postgres.sh /path/to/backup.dump -e production --force   # skip confirmation
```
`pg_restore --clean --if-exists` - drops and recreates objects covered by
the dump. Without `--force` it asks for confirmation first; use `--force`
only in scripted/non-interactive contexts where you've already verified the
target.

To test a restore against a genuinely clean database (e.g. validating a
backup is actually usable):
```bash
docker compose down
docker volume rm mankahi-dev-compose_postgres-data   # check exact volume name via `docker volume ls` first
docker compose up -d
# wait for init-db to finish recreating the schema, then:
./restore-postgres.sh /path/to/backup.dump -e development --force
```

## Rotate env values (secrets, API keys, DB passwords)

1. Edit the live env file directly - `docker/compose/.env.development` or
   `.env.production` (never `.env.example`/`.env.production.example`,
   those are templates only and are the only env files committed to git).
2. Recreate every service that reads the changed value:
   ```bash
   docker compose up -d --force-recreate
   ```
   A plain `restart` will NOT pick up an env file change - Compose only
   re-reads `env_file:` contents on container creation.
3. If the changed value is `CORS_ORIGIN`/`FRONTEND_URL`/anything nginx
   also depends on indirectly, restart nginx too (see the gotcha above).
4. If you rotated a JWT signing secret, every previously-issued access/
   refresh token becomes invalid immediately - expect all logged-in users
   to be logged out. There's no dual-secret rollover support today.
5. Verify with `docker compose ps` (all healthy) and a live login attempt
   through the gateway before considering the rotation done.

## Common troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| 502 through nginx right after recreating a backend service | nginx's cached upstream DNS/IP is stale | `docker compose restart nginx` |
| Frontend crash-loops with `EADDRINUSE: /tmp/nitro/worker-*.sock` | Stale `/tmp` socket surviving a plain restart of the same container | `docker compose up -d --force-recreate frontend` (force-recreate gives a fresh filesystem; plain restart does not) |
| `curl http://localhost:PORT` hangs from a bash/git-bash shell but the browser works fine | git-bash's bundled curl resolves bare `localhost` to `::1` first, which doesn't route through Docker Desktop's Windows port-forwarding | Use `curl -4 http://127.0.0.1:PORT` (forces IPv4), or use the browser/PowerShell's `Invoke-WebRequest` to check connectivity |
| A service shows `unhealthy` in `docker compose ps` | Check its logs first (`docker compose logs <service> --tail 50`) before assuming infra is broken | Most causes are DB/Redis not ready yet (transient during startup, self-resolves) or a real crash loop (check the error, not just the retry count) |
| Env var change has no effect | Plain `restart` doesn't re-read `env_file:`/`environment:` | `docker compose up -d --force-recreate <service>` |

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
- add backup and restore scripts
- decide how Grafana should be accessed privately
- configure real TLS/domain behavior for nginx or Cloudflare

## Kubernetes Status

Kubernetes manifests exist, but they are not the current supported deployment path.

Current issues:

- `kubectl kustomize kubernetes/overlays/development` fails because `kubernetes/base/.env` is missing.
- `kubernetes/scripts/deploy.sh` calls standalone `kustomize build`, but standalone `kustomize` is not installed on this machine.
- The repo has both `kubernetes/overlays/...` and `kubernetes/environments/...`, which should be consolidated.
- Stateful components are modeled as basic Deployments and PVCs, not production-grade StatefulSets/operators/clusters.

Kubernetes should be repaired after Docker Compose production is stable.

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

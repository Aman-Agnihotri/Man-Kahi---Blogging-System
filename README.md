# ManKahi

ManKahi is a blogging platform for writers who want a clean publishing space: markdown posts, searchable stories, author profiles, reader engagement, analytics, and moderation tools.

It's a service-oriented application, built to run well on a laptop or a single server, with a clean enough architecture to scale further later.

## Features

### Publishing

Markdown-based posts with title, slug, content, cover image, tags, categories, excerpt, and SEO fields (meta title/description/canonical URL). Every post keeps both its raw markdown and rendered HTML, so re-opening it for editing shows clean markdown. Every edit is captured as a revision, viewable and restorable from the editor.

### Discovery

Full-text search backed by Elasticsearch, filterable by category and tags, with a trending-posts feed, related-post suggestions, and pagination. Redis caches hot reads.

### Reader Engagement

Likes, bookmarks, threaded (one level) comments, reading-progress tracking, and share links.

### Accounts and Social

Local login plus an optional Google OAuth path, password reset, avatar upload, bio and social links, following other authors, notification preferences, and self-service account deletion.

### Analytics

Tracks views, reads, reading progress, and link clicks per post, plus platform-wide and trending stats.

### Moderation

Admins can hide/unhide or hard-delete posts, suspend/unsuspend users (enforced at login), assign/revoke roles, review and resolve reported content, and manage the category catalog. Every moderation action is recorded in a searchable audit log.

### Observability and Ops

Structured, service-tagged, secret-redacted logging with request IDs; Prometheus metrics with auto-provisioned Grafana dashboards; documented alert recommendations and an operational runbook (backups, restores, log locations, troubleshooting).

## Architecture

ManKahi is a service-oriented application:

```text
Browser
  -> Nginx gateway
  -> Nuxt frontend
  -> Auth, Blog, Analytics, and Admin services
  -> PostgreSQL, Redis, Elasticsearch, and object storage
```

Only nginx is public in production; every backing service stays private. Read the full architecture notes in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository layout

| Path | Role |
|---|---|
| `frontend/` | Nuxt 3 frontend |
| `backend/{auth,blog,analytics,admin,init}-service/` | Backend microservices |
| `backend/shared/` | Shared library (Prisma schema, config, middlewares, utils) used by all backend services |
| `docker/` | Docker Compose stack — the local dev environment (dev + production variants) |
| `kubernetes/base/` | Kustomize base app manifests |
| `kubernetes/environments/` | Kustomize overlays: `development/`, `production/`; `oci/` added in upcoming phases |
| `kubernetes/platform/` | Cluster platform components (cert-manager issuers, Argo CD apps, sealed-secrets, ingress-nginx, network policies) — added in upcoming phases |
| `kubernetes/scripts/` | Imperative deploy scripts — slated for removal in an upcoming phase (replaced by GitOps) |
| `terraform/` | OCI infrastructure — added in upcoming phases |
| `.github/workflows/` | CI: tests + multi-arch images to GHCR — added in upcoming phases |
| `docs/` | Project documentation |

## Tech Stack

- **Frontend:** Nuxt 3 (Vue), Tailwind CSS
- **Backend:** Node.js/TypeScript microservices (auth, blog, analytics, admin), Express, Prisma
- **Data:** PostgreSQL, Redis, Elasticsearch, MinIO (S3-compatible object storage)
- **Gateway:** Nginx
- **Observability:** Prometheus, Grafana, Pino structured logging
- **Infra:** Docker Compose (dev and production), with Kubernetes manifests in progress

## Getting Started

The stack runs locally via Docker Compose:

```bash
cd docker/compose
docker compose up -d --build
```

Once running, use the gateway:

```text
http://localhost:8080
```

To share it on a temporary public link without any real deployment, point a Cloudflare quick tunnel at the gateway:

```bash
docker run --rm cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:8080
```

Cloudflare prints a public `https://*.trycloudflare.com` URL that proxies straight to nginx. It's temporary and disappears when the container stops.

Full setup, environment configuration, and production deployment steps live in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Scaling Guidance](docs/SCALING.md)
- [Alerting Recommendations](docs/ALERTING.md)
- [Operational Runbook](docs/RUNBOOK.md)
- [Action Plan](docs/ACTION_PLAN.md) (product vision, roadmap, and known gaps)

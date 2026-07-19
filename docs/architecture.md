# ManKahi Architecture

## Purpose

This document describes the architecture of ManKahi: a service-oriented blogging platform that runs identically on a laptop (Docker Compose) and on its production Kubernetes cluster, with a clean path to later horizontal scaling.

The current goal is not massive traffic from day one. The goal is a clean, maintainable system that can run well on a laptop or one server today and evolve without a rewrite.

## Runtime Shape

```text
Browser
  -> Gateway (nginx locally; ingress-nginx + cert-manager TLS in production)
  -> Nuxt frontend
  -> Auth service
  -> Blog service
  -> Analytics service
  -> Admin service
  -> PostgreSQL
  -> Redis
  -> Elasticsearch
  -> MinIO/object storage
  -> Prometheus/Grafana
```

## Core Principles

- The gateway (nginx locally, ingress-nginx in production) is the only public entrypoint.
- Application services stay private behind the gateway.
- Postgres, Redis, Elasticsearch, and MinIO stay private.
- Services should be stateless wherever practical.
- Persistent data belongs in backing stores and named volumes.
- Environment-specific configuration belongs in env files or secret stores.
- Production deployment runs on k3s/OCI via GitOps - see `docs/oci-deployment.md`, `docs/gitops.md`, and `docs/operations.md`. Docker Compose is the local development target.

## Services

| Component | Responsibility |
| --- | --- |
| Frontend | Nuxt user interface for readers, writers, profiles, auth, and docs |
| Nginx | Gateway and reverse proxy for frontend and APIs |
| Auth service | Register, login, logout, refresh tokens, roles, OAuth path |
| Blog service | Blog CRUD, markdown processing, tags, search indexing, caching |
| Analytics service | Events, reading progress, reads, link clicks, blog analytics |
| Admin service | Dashboard, analytics views, visibility controls, RBAC-protected APIs |
| PostgreSQL | Primary relational database through Prisma |
| Redis | Cache, token blacklist, counters, rate-limit style data |
| Elasticsearch | Full-text blog search |
| MinIO | Object storage path for uploaded media |
| Prometheus/Grafana | Metrics and dashboards |

## Data Model Summary

The Prisma schema currently models:

- users and OAuth providers
- blogs, revisions, categories, tags, and blog-tag mappings
- blog analytics and analytics events
- cache-control records
- roles, permissions, and user-role mappings

The schema is broad enough for a serious blogging product.

## Request Flow

### Reader Flow

```text
Browser
  -> Nginx
  -> Frontend
  -> Blog service
  -> Redis cache
  -> PostgreSQL and Elasticsearch as needed
```

Expected behavior:

- homepage and explore pages request real blog data
- post pages resolve by slug
- search uses Elasticsearch
- repeated reads benefit from Redis/nginx caching where appropriate

### Writer Flow

```text
Browser
  -> Nginx
  -> Frontend
  -> Auth service for session state
  -> Blog service for draft/publish/update/delete
  -> PostgreSQL
  -> Elasticsearch indexing
  -> Redis cache invalidation
  -> MinIO for cover images
```

Design note:

Blog writes currently mix database writes, search indexing, cache work, and upload handling synchronously. That is a deliberate fit for the current single-server stage, and the code is shaped so indexing and analytics can move to workers if the scaling path in [scaling.md](scaling.md) is taken. (Search indexing on this path is already isolated behind a circuit breaker, so an Elasticsearch outage degrades search rather than failing the write — see [resilience.md](resilience.md).)

### Admin Flow

```text
Browser
  -> Nginx
  -> Frontend/admin views
  -> Admin service
  -> PostgreSQL
  -> Analytics service
```

## Resilience

blog-service's Elasticsearch access is funneled through a single circuit
breaker. When Elasticsearch is unavailable, search returns an empty,
explicitly-degraded result (HTTP 200) and blog reads/writes
(Postgres/Redis-backed) are unaffected; indexing during an outage is
best-effort. Liveness probes are dependency-free across all four backend
services, so a backing-store outage removes a pod from rotation without
restart-looping it.

Full design, metrics, and chaos drills in [docs/resilience.md](resilience.md).

## Deployment Architecture

### Local Development Target

Docker Compose is the local development target - see `docs/local-development.md`.

Development:

- hot reload
- local env file
- local volumes
- nginx on `localhost:8080`

Laptop public demo:

- same local stack
- Cloudflare Tunnel pointing to nginx
- no public database/cache/search ports

### Production Target

Production runs on k3s/OCI via GitOps - see `docs/oci-deployment.md`, `docs/gitops.md`, and `docs/operations.md`.

### Future Target

When scale requires it, the future architecture should introduce:

- managed or clustered Postgres
- read replicas and connection pooling
- Redis Cluster or managed Redis
- OpenSearch/Elasticsearch cluster
- cloud object storage and CDN
- async queue/workers for analytics and search indexing
- horizontal scaling for stateless services

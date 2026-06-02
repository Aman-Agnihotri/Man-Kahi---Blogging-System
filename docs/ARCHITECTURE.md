# ManKahi Architecture

Last updated: 2026-06-02

## Purpose

This document describes the intended architecture for ManKahi as a professional single-server blogging platform with a clean path to later horizontal scaling.

The current goal is not massive traffic from day one. The goal is a clean, maintainable system that can run well on a laptop or one server today and evolve without a rewrite.

## Runtime Shape

```text
Browser
  -> Cloudflare/domain/TLS, optional for public exposure
  -> Nginx gateway
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

- Nginx is the only public entrypoint in production.
- Application services stay private behind the gateway.
- Postgres, Redis, Elasticsearch, and MinIO stay private.
- Services should be stateless wherever practical.
- Persistent data belongs in backing stores and named volumes.
- Environment-specific configuration belongs in env files or secret stores.
- Docker Compose is the current primary deployment target.
- Kubernetes is a future target after the Compose path is stable.

## Services

| Component | Responsibility | Current State |
| --- | --- | --- |
| Frontend | Nuxt user interface for readers, writers, profiles, auth, and docs | Runs locally; many pages still use dummy data |
| Nginx | Gateway and reverse proxy for frontend and APIs | Runs locally through `localhost:8080` |
| Auth service | Register, login, logout, refresh tokens, roles, OAuth path | Mostly implemented; lockout and OAuth config need cleanup |
| Blog service | Blog CRUD, markdown processing, tags, search indexing, caching | Implemented with several route/schema issues to fix |
| Analytics service | Events, reading progress, reads, link clicks, blog analytics | Implemented; admin-facing contract needs alignment |
| Admin service | Dashboard, analytics views, visibility controls, RBAC-protected APIs | Implemented; depends on missing/mismatched analytics routes |
| PostgreSQL | Primary relational database through Prisma | Current primary store |
| Redis | Cache, token blacklist, counters, rate-limit style data | Current cache/runtime data store |
| Elasticsearch | Full-text blog search | Current local search backend |
| MinIO | Object storage path for uploaded media | Present in Compose; upload field integration needs cleanup |
| Prometheus/Grafana | Metrics and dashboard scaffolding | Present but needs verification against actual metrics |

## Data Model Summary

The Prisma schema currently models:

- users and OAuth providers
- blogs, revisions, categories, tags, and blog-tag mappings
- blog analytics and analytics events
- cache-control records
- roles, permissions, and user-role mappings

The schema is broad enough for a serious blogging product, but service code and frontend integration still need to be aligned with it.

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

Current concern:

Blog writes currently mix database writes, search indexing, cache work, and upload handling synchronously. That is acceptable for the single-server stage, but the code should be shaped so indexing and analytics can move to workers later.

### Admin Flow

```text
Browser
  -> Nginx
  -> Frontend/admin views
  -> Admin service
  -> PostgreSQL
  -> Analytics service
```

Current concern:

Admin service expects some analytics routes that the analytics service does not currently provide. These contracts should be fixed before expanding admin features.

## Deployment Architecture

### Current Supported Target

The current supported target is Docker Compose on a laptop or single server.

Development:

- hot reload
- local env file
- local volumes
- nginx on `localhost:8080`

Laptop public demo:

- same local stack
- Cloudflare Tunnel pointing to nginx
- no public database/cache/search ports

Single-server production target:

- hardened Docker Compose production file
- nginx on `80` and `443`
- private service network
- persistent volumes
- backup/restore scripts
- monitoring and logs

### Future Target

Kubernetes should be treated as future work until the Compose deployment is clean.

When scale requires it, the future architecture should introduce:

- managed or clustered Postgres
- read replicas and connection pooling
- Redis Cluster or managed Redis
- OpenSearch/Elasticsearch cluster
- cloud object storage and CDN
- async queue/workers for analytics and search indexing
- horizontal scaling for stateless services

## Known Architecture Gaps

- Blog delete route checks an ID as if it were a slug.
- Suggested blogs route/controller params do not match.
- User blogs route can hit authenticated-only controller behavior without auth.
- Upload handling uses `imageUrl`, while the Prisma blog model uses `coverImage`.
- Admin analytics routes do not match analytics service routes.
- Admin visibility validation rejects real Prisma IDs.
- Auth lockout writes `lockedUntil` but does not enforce it.
- OAuth callback paths need standardization.
- Production Compose exposes too many internal services.
- Kubernetes manifests currently do not build cleanly.

The full prioritized checklist is tracked in [ACTION_PLAN.md](ACTION_PLAN.md).

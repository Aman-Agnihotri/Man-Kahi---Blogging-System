# ManKahi

ManKahi is a blogging platform for writers who want a clean publishing space, searchable stories, author profiles, analytics, and moderation tools.

The project is being refactored into a professional-grade single-server application: easy to run on a laptop today, deployable to one server next, and structured so the services can scale later without a full rewrite.

## Product Vision

ManKahi should feel like a complete writing product, not just a technical demo.

Writers should be able to:

- create an account and manage their profile
- write, save, edit, publish, and unpublish stories
- add cover images, tags, categories, excerpts, and SEO metadata
- view their own stories and performance from a dashboard
- build a public author profile

Readers should be able to:

- browse recent and featured stories
- search full-text content
- read posts by slug
- explore categories and tags
- discover related and trending posts

Admins should be able to:

- review platform activity
- moderate blog visibility
- inspect analytics
- manage unsafe or inappropriate content

## Current Status

The local Docker stack is running and usable as the current development/demo environment.

Working foundation:

- Nuxt frontend
- Nginx gateway
- Auth service
- Blog service
- Analytics service
- Admin service
- PostgreSQL
- Redis
- Elasticsearch
- MinIO integration path
- Prometheus/Grafana scaffolding
- Cloudflare Tunnel demo path

Still in progress:

- frontend pages are not fully connected to real backend data
- several backend API contracts need cleanup
- production Docker Compose needs hardening
- Kubernetes manifests are scaffolding, not the current deployment target
- test coverage needs to be expanded around core workflows

## Product Areas

### Publishing

The blog system is designed around markdown-based publishing with title, slug, content, cover image, tags, categories, excerpt, and SEO fields.

### Discovery

Search is backed by Elasticsearch, with Redis caching planned around hot reads and repeated queries.

### Accounts

Authentication supports local login and an optional Google OAuth path. Role and permission models exist for admin-level access.

### Analytics

The analytics service tracks views, reading progress, reads, and link clicks. Admin-facing analytics needs contract cleanup before it should be treated as complete.

### Moderation

Admin APIs exist for dashboard-style operations and blog visibility controls. These need final route/schema alignment before the admin workflow is considered production-ready.

## Architecture Summary

ManKahi uses a service-oriented architecture:

```text
Browser
  -> Nginx gateway
  -> Nuxt frontend
  -> Auth, Blog, Analytics, and Admin services
  -> PostgreSQL, Redis, Elasticsearch, and object storage
```

The immediate target is a polished single-server deployment where only nginx is public and every backing service remains private.

Read the full architecture notes in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Action Plan](docs/ACTION_PLAN.md)

## Local Access

When the development stack is running, use the gateway:

```text
http://localhost:8080
```

Detailed setup and deployment commands live in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project Direction

The next milestone is:

```text
Professional single-server MVP deployment + real core blogging workflow
```

That means:

- reliable local development
- clean single-server production path
- real frontend-to-backend integration
- tested auth and blog workflows
- public gateway only
- documented operations, backup, restore, and monitoring

Progress is tracked in [ACTION_PLAN.md](ACTION_PLAN.md).

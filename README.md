# ManKahi

ManKahi is a blogging platform for writers who want a clean publishing space, searchable stories, author profiles, reader engagement, analytics, and moderation tools.

The project is a service-oriented application: easy to run on a laptop today, deployable to one server now, and structured so the services can scale onto Kubernetes later without a full rewrite.

## Product Vision

ManKahi should feel like a complete writing product, not just a technical demo.

Writers should be able to:

- create an account and manage their profile, avatar, bio, and social links
- write, save, edit, publish, and unpublish stories, with markdown preview
- add cover images, tags, categories, excerpts, and SEO metadata
- view and restore prior versions of a post from its edit history
- view their own stories and performance from a dashboard
- build a public author profile and follow/be followed by other writers

Readers should be able to:

- browse recent, featured, and trending stories
- search full-text content and filter by category
- read posts by slug, with reading-progress tracking
- like, bookmark, comment on, and share posts
- explore categories and tags, and discover related posts
- report abusive posts or comments

Admins should be able to:

- review platform activity and analytics
- moderate blog visibility and hard-delete abusive content
- manage users (suspend/unsuspend) and roles (assign/revoke)
- review and resolve/dismiss reported content
- audit every moderation action via a searchable audit log

## Current Status

The local Docker stack is running and is the current development/demo environment. All 12 containers (frontend, nginx, 4 backend services, Postgres, Redis, Elasticsearch, MinIO, Prometheus, Grafana) report healthy, and the full core-loop smoke test passes end-to-end through the real nginx gateway.

Working foundation:

- Nuxt frontend, fully wired to real backend data (no mock/placeholder data remaining anywhere in the product, including categories and public author profiles)
- Nginx gateway (only public entrypoint), with a real CORS allowlist and a tightened CSP
- Auth service (accounts, profiles, avatars, follows, notification preferences, password reset)
- Blog service (posts, cover images, categories, likes, bookmarks, comments, revisions, trending)
- Analytics service (views, reads, progress, link clicks)
- Admin service (users, roles, reports, audit log, category management)
- PostgreSQL, Redis, Elasticsearch, MinIO (object storage, S3-compatible), all with pinned image versions
- Prometheus/Grafana monitoring, auto-provisioned dashboards and datasource, with documented alert recommendations (`docs/ALERTING.md`)
- Structured, service-tagged, secret-redacted logging with request IDs (`docs/RUNBOOK.md`)
- Cloudflare Tunnel demo path
- Postgres backup/restore scripts
- 300 backend tests passing; frontend and root typecheck clean

Still in progress / known gaps:

- notification preferences are stored but not yet wired to actual email delivery (no email provider is configured anywhere in this codebase; password reset uses a dev-only stub that logs the reset link)
- Kubernetes manifests are partially repaired (`kubernetes/base` builds cleanly; the per-environment overlays still have one outstanding kustomize issue) and are not the current deployment target
- production TLS/domain configuration for nginx (or a Cloudflare named tunnel) still needs to be set up per-deployment - see `docs/DEPLOYMENT.md`
- posts saved before the markdown/HTML content-round-trip fix will show rendered HTML instead of markdown the first time they're reopened for editing; re-saving fixes it going forward
- no automated frontend tests (no test framework installed); frontend correctness is covered by typecheck plus manual and live-browser verification

## Product Areas

### Publishing

Markdown-based publishing with title, slug, content, cover image, tags, categories, excerpt, and SEO fields (meta title/description/canonical URL). Every post stores both the raw markdown source and its rendered HTML, so re-opening a post for editing shows clean markdown rather than rendered markup. Every content edit is auto-captured as a revision, viewable and restorable from the editor.

### Discovery

Search is backed by Elasticsearch, filterable by category and tags, with a trending-posts feed and related-posts suggestions. Redis caches hot reads.

### Reader Engagement

Likes, bookmarks, threaded (one level) comments, reading-progress tracking, and share links, all live-verified against the real stack.

### Accounts and Social

Authentication supports local login and an optional Google OAuth path. Profiles support avatar upload, bio, and social links. Users can follow authors and manage notification preferences or delete their account.

### Analytics

The analytics service tracks views, reading progress, reads, and link clicks.

### Moderation

Admins can hide/unhide or hard-delete posts, suspend/unsuspend users (enforced at login), assign/revoke roles, review reported content, and manage the category catalog. Every moderation action is recorded in a searchable audit log.

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
- [Scaling Guidance](docs/SCALING.md)
- [Alerting Recommendations](docs/ALERTING.md)
- [Operational Runbook](docs/RUNBOOK.md)
- [Action Plan](docs/ACTION_PLAN.md)

## Local Access

When the development stack is running, use the gateway:

```text
http://localhost:8080
```

Detailed setup and deployment commands live in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project Direction

The professional single-server MVP, security hardening, observability, and the core product feature set (reader engagement, content authoring, user/social, admin and moderation) are all complete and live-verified. The next milestone is:

```text
Finish Kubernetes readiness and close the remaining documented gaps
```

That means:

- resolving the last kustomize overlay issue so `environments/*` builds cleanly, not just `base`
- real email delivery behind the existing notification-preferences and password-reset groundwork
- production TLS/domain configuration for a real deployment (see `docs/DEPLOYMENT.md`)

Progress is tracked in [docs/ACTION_PLAN.md](docs/ACTION_PLAN.md).

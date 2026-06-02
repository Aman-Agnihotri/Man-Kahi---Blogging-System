# ManKahi Professionalization Action Plan

Last updated: 2026-06-02

## Goal

Turn ManKahi into a professional-grade blogging platform that runs well on a home laptop or single server today, while keeping the architecture clean enough to scale later without a full rewrite.

## Scope

- Primary target: local development, laptop demo, and single-server production.
- Future target: horizontal scaling through stateless services, private infrastructure services, clean service contracts, and replaceable deployment layers.
- Current non-goal: proving support for 5 million users, 100k concurrent users, or 10k concurrent writes.
- Current non-goal: Kubernetes production readiness before the Docker Compose deployment is solid.

## Tracking Rules

- `[ ]` Not started.
- `[x]` Completed.
- Add implementation notes under each task when work begins.
- Do not mark a phase complete until its acceptance criteria are met.
- Keep this file updated after every meaningful implementation session.

## Progress Snapshot

- [x] Local Docker Compose stack runs on the laptop.
- [x] Nginx gateway exposes the app locally through `localhost:8080`.
- [x] Cloudflare Tunnel path has been proven for laptop demo exposure.
- [ ] Production Docker Compose is reliable and locked down.
- [ ] Frontend pages are connected to real backend data.
- [ ] Backend API contracts are cleaned up.
- [ ] Tests cover core user and admin workflows.
- [x] README links to product, architecture, deployment, and action-plan docs.

## Architecture Direction

The system should remain service-oriented, but the immediate deployment target should be a polished single-server setup.

Target runtime shape:

```text
Browser
  -> Cloudflare/TLS/domain
  -> Nginx gateway
  -> Nuxt frontend
  -> Auth service
  -> Blog service
  -> Analytics service
  -> Admin service
  -> Private Postgres
  -> Private Redis
  -> Private Elasticsearch
  -> Private MinIO/object storage
  -> Prometheus/Grafana observability
```

Core principles:

- Only nginx should be public in production.
- Backend services should be private and stateless where practical.
- Postgres, Redis, Elasticsearch, and MinIO must not be exposed publicly.
- Environment configuration should be explicit and reproducible.
- Deployment should be boring: one documented command path for each mode.
- Feature work should start only after core API contracts are stable.

## Phase 0: Baseline And Inventory

Purpose: establish a clean baseline before more feature work.

- [x] Confirm local Docker services can run together.
- [x] Confirm frontend, backend services, Postgres, Redis, Elasticsearch, and nginx are healthy locally.
- [x] Identify broken backend API contracts and deployment inconsistencies.
- [x] Create a known-issues section in the README or link this action plan from the README.
- [x] Capture the current public demo method using Cloudflare Tunnel.
- [x] Move `ACTION_PLAN.md` into `docs/` with the other project docs.

Acceptance criteria:

- The repo has one visible tracking document.
- Known bugs are captured before implementation begins.
- The current deployment state is clear to a new reader.

## Phase 1: Professional Single-Server Deployment

Purpose: make the project deploy cleanly on a laptop or one Linux server.

### Development Compose

- [x] Keep `docker/compose/docker-compose.yml` as the official development stack.
- [ ] Verify hot reload works for frontend and backend services.
- [ ] Verify database initialization works from a clean volume.
- [x] Verify health checks for auth, blog, analytics, admin, nginx, Postgres, Redis, and Elasticsearch.
- [x] Add clear commands for start, stop, rebuild, reset, logs, and health checks.
- [x] Document required local prerequisites: Docker, Docker Compose, ports, env file.

### Production Compose

- [x] Fix service name mismatches, including `initdb` vs `init-db`.
- [x] Bind internal service ports to private networks only.
- [x] Ensure only nginx exposes public `80` and `443`.
- [x] Remove public exposure of Postgres, Redis, Elasticsearch, MinIO, app services, Prometheus, and Grafana.
- [x] Align Elasticsearch security settings with actual app connection config.
- [x] Align MinIO SSL settings with actual server configuration.
- [x] Replace development commands with production build/start commands.
- [x] Add `restart: unless-stopped` where appropriate.
- [x] Add persistent named volumes for database, cache, search, uploads, logs, Prometheus, and Grafana.
- [x] Add resource limits that make sense for a single server.
- [x] Add `.env.production.example` with all required variables.
- [x] Add production domain and API URL guidance.
- [x] Add deployment commands for first deploy and later updates.

### Cloudflare Tunnel

- [x] Document quick tunnel for temporary demo.
- [x] Document named tunnel for stable domain routing.
- [x] Ensure tunnel points only to nginx.
- [x] Document DNS and Cloudflare Access recommendations.

### Backups And Restore

- [ ] Add Postgres backup script.
- [ ] Add Postgres restore script.
- [ ] Add MinIO/upload backup guidance.
- [ ] Add Redis persistence guidance.
- [ ] Add Elasticsearch snapshot guidance or local export fallback.
- [ ] Document where backups are stored.
- [ ] Document how often backups should run.
- [ ] Test restore against a clean local volume.

Acceptance criteria:

- A fresh machine can deploy the app using documented steps.
- Only the gateway is public.
- A clean database can be initialized predictably.
- There is a tested backup and restore path for critical data.

## Phase 2: Backend API Contract Cleanup

Purpose: make existing services internally consistent before expanding features.

### Auth Service

- [ ] Enforce `lockedUntil` during login attempts.
- [ ] Confirm failed login attempts reset correctly after lock expiry.
- [ ] Clean up Google OAuth route and callback URL configuration.
- [ ] Decide whether Google OAuth is optional or required per environment.
- [ ] Ensure logout invalidates tokens consistently.
- [ ] Confirm refresh-token rotation behavior.
- [ ] Add missing auth tests for register, login, lockout, refresh, logout, and OAuth-disabled mode.

### Blog Service

- [ ] Fix delete route so it checks a blog ID as a blog ID, not as a slug.
- [ ] Fix suggested blogs controller to read `blogId` from route params.
- [ ] Protect `GET /api/blogs/user` or change controller behavior for anonymous users.
- [ ] Align uploaded image field with Prisma `coverImage`.
- [ ] Add slug collision handling.
- [ ] Decide draft vs published behavior for create and update.
- [ ] Ensure blog create/update/delete invalidates Redis and Elasticsearch consistently.
- [ ] Add tests for create, read by slug, update, delete, search, tags, suggestions, and user blogs.

### Analytics Service

- [ ] Decide whether public blog reads can produce anonymous analytics events.
- [ ] Add missing admin-facing endpoints or update admin service expectations.
- [ ] Confirm read progress behavior for authenticated and anonymous readers.
- [ ] Add clear event schema for views, reads, progress, and link clicks.
- [ ] Add tests for event tracking, progress, link tracking, and blog analytics retrieval.

### Admin Service

- [ ] Align admin analytics calls with analytics service routes.
- [ ] Fix blog visibility ID validation to support actual Prisma IDs.
- [ ] Confirm RBAC requirements for each admin endpoint.
- [ ] Ensure dashboard user counts reflect real user lifecycle.
- [ ] Add tests for dashboard, blog analytics, user analytics, trending, tags, and visibility.

Acceptance criteria:

- All documented API routes work against the current Prisma schema.
- Service-to-service calls use routes that actually exist.
- Core backend behavior has focused automated tests.

## Phase 3: Frontend Integration

Purpose: turn the UI from mostly static screens into a real blogging product.

### App Shell And API Client

- [ ] Create a consistent API client layer for frontend calls.
- [ ] Use configured public API base URL consistently.
- [ ] Standardize loading, error, and empty states.
- [ ] Ensure auth state survives refresh correctly.
- [ ] Decide where tokens are stored for this stage and document security tradeoffs.

### Public Reading Experience

- [ ] Replace dummy homepage feed with real blog API data.
- [ ] Replace dummy explore page data with real search/list API data.
- [ ] Replace dummy post page data with `GET /api/blogs/:slug`.
- [ ] Connect categories to real category/tag data.
- [ ] Add pagination or load-more backed by API params.
- [ ] Add graceful behavior when no posts exist.

### Writing Experience

- [ ] Connect write page to real create-blog endpoint.
- [ ] Add edit mode for existing blog posts.
- [ ] Add draft/publish controls.
- [ ] Add cover image upload.
- [ ] Add validation errors from backend to the form UI.
- [ ] Add post-submit redirect to the created post or user stories.

### User Area

- [ ] Connect dashboard stats to real user data.
- [ ] Connect user stories table to real user blogs.
- [ ] Connect profile page to real user profile data.
- [ ] Connect settings page to real profile update APIs.
- [ ] Add delete/unpublish actions with confirmation.

### Admin UI

- [ ] Decide whether admin UI is part of the Nuxt app or a separate future app.
- [ ] Add admin dashboard route protection.
- [ ] Connect admin dashboard to real admin APIs.
- [ ] Add blog moderation controls.
- [ ] Add analytics views only after backend contracts are stable.

Acceptance criteria:

- A user can register, log in, create a post, publish it, view it publicly, edit it, and see it in their dashboard.
- Dummy data is removed from core product pages.
- The frontend handles empty, loading, and error states professionally.

## Phase 4: Security And Production Hardening

Purpose: make the app safe enough for public demo and single-server use.

- [ ] Add strong `.env` examples without real secrets.
- [ ] Verify `.gitignore` excludes all real env and secret files.
- [ ] Ensure all services use `helmet` and CORS intentionally.
- [ ] Tighten CORS for production domain.
- [ ] Review nginx security headers.
- [ ] Add request body size limits appropriate to uploads.
- [ ] Add rate limits that do not break normal use.
- [ ] Add password reset flow.
- [ ] Add email verification or explicitly mark it future.
- [ ] Add basic account/profile update validation.
- [ ] Add admin-only moderation protections.
- [ ] Add dependency audit workflow.

Acceptance criteria:

- Public demo does not expose internal services.
- Secrets are not committed.
- Auth and admin flows have sensible protection.
- Security assumptions are documented.

## Phase 5: Observability And Operations

Purpose: make the app understandable when it is running.

- [ ] Ensure every service exposes `/health`.
- [ ] Ensure every service exposes `/metrics`.
- [ ] Fix Prometheus scrape config for the actual runtime.
- [ ] Fix Grafana provisioning for current metrics.
- [ ] Add structured logs with service name and request IDs.
- [ ] Add nginx access/error log volume.
- [ ] Add service log volume strategy or container logging guidance.
- [ ] Add basic alert recommendations for disk, memory, CPU, database health, and service failures.
- [ ] Add operational runbook: restart service, view logs, backup, restore, rotate env values.

Acceptance criteria:

- A running deployment can answer: what is up, what is failing, and where to look next.
- Health, logs, and metrics are documented.

## Phase 6: Test And Quality Baseline

Purpose: stop regressions while refactoring and adding features.

- [ ] Add a root-level test command or script that runs all service tests.
- [ ] Add auth service integration tests.
- [ ] Add blog service integration tests.
- [ ] Add analytics service tests.
- [ ] Keep and expand admin service tests.
- [ ] Add frontend smoke tests for core routes.
- [ ] Add API contract tests for nginx-routed endpoints.
- [ ] Add Docker Compose smoke test commands.
- [ ] Add lint/typecheck workflow for each service and frontend.

Acceptance criteria:

- Core workflows are covered by automated tests.
- Local test commands are documented.
- A deployment change can be verified without manual clicking only.

## Phase 7: Core Product Features

Purpose: complete the blogging product after the foundation is stable.

### Content Features

- [ ] Drafts.
- [ ] Publish/unpublish.
- [ ] Edit history or revisions UI.
- [ ] Markdown preview.
- [ ] Cover images.
- [ ] Tags and categories.
- [ ] SEO metadata editing.
- [ ] Related posts.
- [ ] Author profile cards.

### Reader Features

- [ ] Likes.
- [ ] Bookmarks.
- [ ] Comments.
- [ ] Reading progress.
- [ ] Share links.
- [ ] Search filters.
- [ ] Trending posts.

### User Features

- [ ] Public profile editing.
- [ ] Avatar upload.
- [ ] Bio and social links.
- [ ] Follow authors.
- [ ] Notification preferences.
- [ ] Account deletion or deactivation.

### Admin And Moderation

- [ ] Hide/unhide posts.
- [ ] Delete abusive content.
- [ ] Manage users.
- [ ] Manage roles.
- [ ] View reported content.
- [ ] Basic audit log.

Acceptance criteria:

- The product feels like a complete blogging platform, not just a technical demo.
- Feature behavior is documented and tested where risk is meaningful.

## Phase 8: Future Scale Readiness

Purpose: keep the system easy to evolve when traffic grows.

- [ ] Keep services stateless except for backing stores.
- [ ] Separate write path side effects behind service modules.
- [ ] Make search indexing replaceable with async workers later.
- [ ] Make analytics ingestion replaceable with a queue later.
- [ ] Add database connection pooling guidance.
- [ ] Document when to introduce PgBouncer.
- [ ] Document when to move uploads to cloud object storage.
- [ ] Document when to move from Compose to Kubernetes or managed services.
- [ ] Archive or repair Kubernetes manifests after Docker production is solid.
- [ ] Add load-testing scripts for laptop and single-server baselines.

Acceptance criteria:

- The app remains simple today but has clear migration points for tomorrow.
- Future scaling is a planned evolution, not a rewrite.

## Known Issues To Fix First

- [ ] Blog delete uses ID as slug during authorization.
- [ ] Suggested blogs route/controller param mismatch.
- [ ] User blogs route can call authenticated-only controller without auth.
- [ ] Upload field mismatch: `imageUrl` vs `coverImage`.
- [ ] Admin analytics routes do not match analytics service routes.
- [ ] Admin visibility ID validation rejects real Prisma IDs.
- [ ] Auth lockout writes `lockedUntil` but does not enforce it.
- [ ] OAuth callback paths are inconsistent.
- [x] Production Compose exposes too many internal services.
- [x] Production Compose has `initdb` service typo.
- [ ] Kubernetes Kustomize build currently fails due to missing base `.env`.
- [ ] Kubernetes deployment paths are split between `overlays` and `environments`.

## Recommended Implementation Order

1. Deployment cleanup for local and production Compose.
2. Backend API contract fixes.
3. Frontend integration for core blogging workflow.
4. Tests for auth, blog, analytics, admin, and nginx-routed APIs.
5. Security hardening.
6. Observability and backup/restore.
7. Product feature expansion.
8. Kubernetes or cloud-scale preparation.

## Definition Of Done For The Professional MVP

- [ ] One command starts local development reliably.
- [ ] One documented path deploys to a single server.
- [x] Only nginx is public in production.
- [ ] A user can register, log in, write, publish, edit, delete, and view blogs.
- [ ] Search works from real indexed content.
- [ ] User dashboard and stories use real data.
- [ ] Admin can view dashboard data and moderate blog visibility.
- [ ] Backups and restores are documented and tested.
- [ ] Logs, health checks, and metrics work.
- [ ] Core workflows have automated tests.
- [x] README links to this action plan.

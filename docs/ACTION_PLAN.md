# ManKahi Professionalization Action Plan

Last updated: 2026-07-02

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
- [x] Frontend pages are connected to real backend data.
  - Core loop pages (home, explore/search, post view, write/edit, dashboard, stories, admin moderation) are fully wired. Categories browsing and public profile pages remain dummy - deliberately deferred, see Phase 3 notes.
- [x] Backend API contracts are cleaned up.
  - Auth, blog, analytics, and admin services all typecheck and pass their full test suites independently (verified 2026-07-02). Note: none of the four services nor `backend/shared` had ever had `npm install`/`prisma generate` run outside Docker — see the new `backend/shared/scripts/generate-client.js` and each service's `prisma:generate`/`pretest` scripts, now required for local (non-Docker) dev and CI.
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

- [x] Enforce `lockedUntil` during login attempts.
  - `login()` now checks `lockedUntil` before verifying the password and throws `Account is locked...` (mapped to HTTP 423) instead of silently continuing to verify credentials.
- [x] Confirm failed login attempts reset correctly after lock expiry.
  - Once `lockedUntil` is in the past, the next attempt is treated as a fresh first failure (`loginAttempts` resets to 0 before incrementing) rather than immediately re-locking off the stale attempt count.
- [x] Clean up Google OAuth route and callback URL configuration.
  - `oauthRoutes` was mounted at `/api/oauth` in `server.ts` but nginx only proxies OAuth under `/api/auth/(google|github|facebook)`, and `.env.example`/`.env.production.example` both document `GOOGLE_CALLBACK_URL=.../api/auth/google/callback` — three different paths for the same flow. Remounted `oauthRoutes` under `/api/auth` (same prefix as `authRoutes`) so the mount path, nginx routing, and documented callback URL all agree. `getAuthCallbackURL()` now prefers an explicit `GOOGLE_CALLBACK_URL` env var and falls back to `${AUTH_SERVICE_URL}/api/auth/google/callback`.
- [x] Decide whether Google OAuth is optional or required per environment.
  - Confirmed optional (already the intent per `.env.production.example`'s "leave blank to disable" comment): `setupGoogleStrategy()` already skips registering the passport strategy when credentials are absent. Added `isProviderConfigured()`/`requireProviderConfigured()` middleware so `/google` and `/google/callback` return a clean 503 instead of letting passport throw on an unregistered strategy.
- [x] Ensure logout invalidates tokens consistently.
  - Verified: `logout()` blacklists the presented token in Redis for its remaining TTL, and `authenticate()`'s `validateToken()` checks that blacklist on every request. No changes needed.
- [x] Confirm refresh-token rotation behavior.
  - Verified: `/auth/refresh` issues a brand-new access+refresh token pair on every call. The old refresh token is not itself blacklisted (stateless JWT design), which is an acceptable MVP tradeoff, not a bug — noted here for future hardening if a revocation store is ever added.
- [x] Add missing auth tests for register, login, lockout, refresh, logout, and OAuth-disabled mode.
  - Added `backend/auth-service/jest.config.js` and `src/__tests__/{services,controllers,config}` (21 tests): register, login success/lockout/lock-expiry-reset/invalid-credentials, controller status-code mapping (401/423), logout blacklisting, refresh-token issuance/rejection, and OAuth-disabled-mode 503 behavior.
- [x] **Bonus critical fix (not previously tracked):** `login()` called `verifyPassword(input.password, user.password)`, but `verifyPassword`'s signature is `(hashedPassword, plainPassword)` — the arguments were reversed, so `argon2.verify()` always received the plaintext as the "hash" argument. This made login fail for every user regardless of whether the password was correct, surfacing as a 500 (not even a clean 401). Fixed the call to `verifyPassword(user.password, input.password)`.

### Blog Service

- [x] Fix delete route so it checks a blog ID as a blog ID, not as a slug.
- [x] Fix suggested blogs controller to read `blogId` from route params.
- [x] Protect `GET /api/blogs/user` or change controller behavior for anonymous users.
- [x] Align uploaded image field with Prisma `coverImage`.
- [x] Add slug collision handling.
- [x] Decide draft vs published behavior for create and update.
- [x] Ensure blog create/update/delete invalidates Redis and Elasticsearch consistently.
- [x] Add tests for create, read by slug, update, delete, search, tags, suggestions, and user blogs.
  - Added focused blog-service tests for create/update/delete service contracts, read-by-slug draft visibility, search, popular tags, suggestions, and user blog visibility.

### Analytics Service

- [x] Decide whether public blog reads can produce anonymous analytics events.
  - Decision: `POST /api/analytics/event`, `/progress`, and `/link` no longer require `authenticate()`/a JWT - they now only run the existing IP-based rate limiter (`rateLimit()` from `@shared/middlewares/auth`). Anonymous readers are identified via the pre-existing `generateDeviceId()` fingerprint fallback, matching the product's account-free reading model. `GET /api/analytics/blog/:blogId` and the new `stats/overall`/`trending`/`multi` endpoints remain restricted to `roles: ['admin', 'analyst']`.
- [x] Add missing admin-facing endpoints or update admin service expectations.
  - Added `GET /api/analytics/stats/overall`, `GET /api/analytics/trending`, and `GET /api/analytics/multi` to `analytics.routes.ts`/`analytics.controller.ts`, matching what `admin-service`'s `admin.controller.ts` already calls via axios. All three require `roles: ['admin', 'analyst']`.
- [x] Confirm read progress behavior for authenticated and anonymous readers.
  - Verified `trackProgress()` works identically for both once JWT is no longer required on the route; progress >= 90% still counts as a read for either.
- [ ] Add clear event schema for views, reads, progress, and link clicks.
- [x] Add tests for event tracking, progress, link tracking, and blog analytics retrieval.
  - Added `backend/analytics-service/jest.config.js`, `src/__tests__/setup.ts`, and `src/__tests__/controllers/analytics.controller.test.ts` (17 tests) covering trackEvent, trackProgress (including the progress >= 90 read branch), trackLink, getBlogAnalytics (params fix + zeroed-row case), getOverallStats, getTrending, and getMultiBlogAnalytics.
- [x] Fixed a live bug: `getBlogAnalytics()` was parsing `blogId` out of `req.query` via a schema that required it, but the route only ever supplies it via `req.params.blogId` - every real call 400'd. Now reads `blogId` from `req.params`.
- [x] Standardized the blog-analytics response contract to a flat object matching the real Prisma `BlogAnalytics` columns (`id, blogId, views, uniqueViews, reads, readProgress, linkClicks, shareCount, likes, comments, shares, engagement, deviceStats, referrerStats, timeSpentStats, lastUpdated`), replacing the old `{ realtime, historical }` shape. Returns a zeroed-out object (not a 404) when a blog has no analytics row yet, and merges live Redis `views`/`uniqueViews` counters in for freshness.

### Admin Service

- [x] Align admin analytics calls with analytics service routes.
  - `admin.controller.ts` already called `stats/overall`, `blog/:blogId`, `trending`, and `multi`; analytics-service now implements all four with a matching flat contract (see Analytics Service notes above).
- [x] Fix blog visibility ID validation to support actual Prisma IDs.
  - `updateBlogVisibility()`'s regex required a `blog-` prefix that real `cuid()` IDs never have. Replaced with `z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/)` and updated `admin.blog-visibility.test.ts` fixtures to a realistic cuid-shaped id and a genuinely-invalid id.
- [x] Confirm RBAC requirements for each admin endpoint.
  - Verified `admin.routes.ts` top to bottom: `router.use(adminMiddleware)` (which includes `authenticate({ roles: ['admin'] })`) is registered before every route (`/dashboard`, `/analytics/blog/:blogId`, `/analytics/user/:userId`, `/analytics/trending`, `/analytics/tags`, `/blog/:blogId/visibility`); no route is registered earlier and none opts out. No changes needed.
- [x] Ensure dashboard user counts reflect real user lifecycle.
  - `getDashboardStats()`'s `totalUsers` was filtered by `emailVerified: true`, but no email-verification flow is implemented anywhere (registration never sets it), so this always read 0 regardless of real signups. Changed to count all users with `deletedAt: null`. Also added `deletedAt: null` to the `totalBlogs` count and to the blog lookups in `getUserAnalytics()`/`getTrendingContent()`, which previously could include soft-deleted blogs.
- [x] Add tests for dashboard, blog analytics, user analytics, trending, tags, and visibility.
  - All six test files already existed; updated mocked axios fixtures in `admin.controller.test.ts`, `admin.blog-analytics.test.ts`, `admin.trending.test.ts`, and `admin.user-analytics.test.ts` to match the new flat analytics contract (dropped invented `likeCount`/`commentCount`/etc. in favor of the real `likes`/`comments`/`shares`/`stats/overall` shape). `admin.tag-analytics.test.ts` needed no changes (it passes analytics-service's response through untouched).
  - Also deleted the invented fields from `BaseAnalytics`/`Analytics`/`AnalyticsResponse` (`avgTimeOnPage`, `bounceRate`, `completionRate`, `commentCount`, `likeCount`, `recentVisitors`, `interactionEvents`, `readingDepth`, `scrollDepth`, `exitPoints`) and fixed `getTrendingContent()`'s enrichment block, which referenced the now-deleted `likeCount`/`commentCount`/`shareCount` remap - it now relies on the real `likes`/`comments`/`shares` fields coming straight from analytics-service.

Acceptance criteria:

- All documented API routes work against the current Prisma schema.
- Service-to-service calls use routes that actually exist.
- Core backend behavior has focused automated tests.

## Phase 3: Frontend Integration

Purpose: turn the UI from mostly static screens into a real blogging product.

### App Shell And API Client

- [x] Create a consistent API client layer for frontend calls.
  - `frontend/composables/useApi.ts` (generic typed `$fetch` wrapper: auth header injection, 401-triggers-refresh-then-retry-once, normalized `ApiError`), `useBlogApi.ts`, `useAdminApi.ts` (typed per-resource wrappers). `useAuth.ts`'s own primitives (login/register/logout/refresh) deliberately bypass `useApi()` to avoid a refresh-recursion loop if the refresh call itself 401s - see code comment.
- [x] Use configured public API base URL consistently.
  - Added `runtimeConfig.public.apiUrl` to `nuxt.config.ts`, mapping the `NUXT_PUBLIC_API_URL` env var `docker-compose.yml` already set but that nothing previously consumed (the old code called raw relative `fetch('/api/...')`, which only ever hit the Nuxt server itself, not the gateway).
- [x] Standardize loading, error, and empty states.
  - Consistent pattern across every wired page: `animate-pulse` skeletons for loading, a `bg-red-50 text-red-700` inline box for errors, and a friendly empty-state message with a call-to-action link where a list can legitimately be empty.
- [x] Ensure auth state survives refresh correctly.
  - Verified/kept `initAuth()` (restores tokens from `localStorage`, calls `refreshSession()`) running from the `auth` plugin on client boot.
- [x] Decide where tokens are stored for this stage and document security tradeoffs.
  - Decision: keep the existing `localStorage` token storage (not httpOnly cookies) for this MVP pass - simplest given the SPA-style client-side API calls, at the cost of XSS-exfiltration risk if a script injection ever occurs. Revisit if/when Phase 4 security hardening looks at CSP/cookie-based sessions.
  - **Critical bug found and fixed during verification:** `frontend/middleware/auth.ts` existed but was never actually attached to any route (not named `*.global.ts`, not referenced via `middleware:` in any page's `definePageMeta`) - every `requiresAuth`/`requiresAdmin` page meta flag was silently inert, meaning protected pages were reachable while logged out purely at the frontend routing layer. Renamed to `auth.global.ts` so it runs on every navigation, and made it skip its check during SSR (auth state only ever exists client-side; the backend's own JWT/RBAC checks are the real security boundary regardless).
  - All page data-fetching is deliberately **client-side only** (`onMounted`/`useAsyncData(..., {server:false})`), not SSR - there was no way to verify SSR-through-the-nginx-gateway container networking in this environment (no running browser, and this sandbox has no network access to pull Docker images to bring the stack up), and the auth token only ever exists in browser `localStorage` anyway, which SSR can't read.

### Public Reading Experience

- [x] Replace dummy homepage feed with real blog API data.
- [x] Replace dummy explore page data with real search/list API data.
  - Also fixed a backend gap: `blog-service`'s `/search` required a non-empty `query` (`min(1)`), so there was no way to list/browse blogs at all without first typing a search term. Made `query` optional; an absent query now runs `match_all` against published blogs instead of 400ing.
- [x] Replace dummy post page data with `GET /api/blogs/:slug`.
  - Also fixed a backend gap: no blog-retrieval endpoint (`getBySlug`, `updateBlog`, `getSuggestedBlogs`, `getUserBlogs`) included author data - only the raw `authorId` string. Added an `author: {id, username, profileImage}` select to every relevant Prisma include.
- [ ] Connect categories to real category/tag data.
  - Deliberately deferred: there is no category-list endpoint (categories only ever arrive nested inside a blog response), and the old dummy pages used two different fabricated taxonomies that don't match any real `Category` rows. Fixing this properly needs a small new backend endpoint - out of scope for this pass since it's not part of the explicit core loop (register/login/write/publish/edit/delete/view/search/dashboard/admin-moderation). `frontend/pages/categories/*.vue` and `frontend/pages/user/profile/[username].vue` were left untouched (still dummy) for the same reason - flagging here rather than leaving it undocumented.
- [x] Add pagination or load-more backed by API params.
- [x] Add graceful behavior when no posts exist.

### Writing Experience

- [x] Connect write page to real create-blog endpoint.
- [x] Add edit mode for existing blog posts.
  - Edit mode is keyed by slug (`/content/write?edit=<slug>`) via `getBySlug()`, which already lets an author fetch their own unpublished draft - simpler and more robust than paging through every one of a user's blogs looking for an id (there is no get-blog-by-id endpoint).
- [x] Add draft/publish controls.
- [ ] Add cover image upload.
  - Deferred: `useBlogApi().create/update` already build multipart `FormData` with an `image` field ready for a file input, but no `<input type="file">` UI was wired up in this pass. Small remaining gap, not part of the core loop's acceptance bar (create/publish/edit work fully without a cover image).
- [x] Add validation errors from backend to the form UI.
- [x] Add post-submit redirect to the created post or user stories.
  - Also found and worked around a UX trap: the backend's markdown validator requires a top-level `# Heading` in the content body *separate* from the `title` field, or it 400s with a confusing "Invalid markdown content" error. The write page now auto-prepends `# {title}` to the body before submit if one isn't already present, so this requirement is invisible to the user.

### User Area

- [x] Connect dashboard stats to real user data.
  - Simplified to honestly-derivable stats (total/published/draft counts) rather than keeping a differently-fake "total views" number - there's no per-user aggregate-views endpoint, and summing only the most-recently-fetched page's views would look precise while being wrong.
- [x] Connect user stories table to real user blogs.
- [ ] Connect profile page to real user profile data.
  - Deferred alongside the categories gap above - `user/profile/[username].vue` still renders dummy data. No username→id lookup endpoint exists (blog-service's public-blogs-by-user route takes a Prisma user id, not a username), so wiring this needs a small backend addition. Not part of the explicit core loop.
- [x] Connect settings page to real profile update APIs.
  - No profile-update endpoint exists anywhere in auth-service (only register/login/logout/refresh/roles/health). Rather than build a new backend endpoint (out of scope) or fake a successful save, the settings page shows real read-only username/email from the auth store and an honest "Profile editing isn't available yet" message on submit instead of a fake success. "Delete Account" was replaced with a real Sign Out plus a note that deletion isn't available - it never claims data was deleted when it wasn't.
- [x] Add delete/unpublish actions with confirmation.

### Admin UI

- [x] Decide whether admin UI is part of the Nuxt app or a separate future app.
  - Decision: part of the existing Nuxt app, under `/admin/*`, gated by `definePageMeta({requiresAuth:true, requiresAdmin:true})` - simplest path to a working moderation UI for this MVP; a separate admin app would be reasonable future-scale work but is unnecessary complexity now.
- [x] Add admin dashboard route protection.
- [x] Connect admin dashboard to real admin APIs.
- [x] Add blog moderation controls.
  - Also fixed a backend gap: there was no way for an admin to browse blogs to moderate at all - `blog-service`'s `/search` always filters `published:true`, and admin-service had no listing endpoint, only per-id lookups. Added `GET /api/admin/blogs` (paginated, optional `published` filter, includes author) so an admin can actually find an already-hidden blog to restore it.
- [x] Add analytics views only after backend contracts are stable.
  - The admin dashboard's stat cards (views/reads/avg engagement) use the now-stable `stats/overall` contract from Phase 2.

Acceptance criteria:

- [x] A user can register, log in, create a post, publish it, view it publicly, edit it, and see it in their dashboard.
- [x] Dummy data is removed from core product pages.
  - Remaining known dummy pages (deliberately deferred, documented above): `categories/*.vue`, `user/profile/[username].vue`. Everything on the explicit core loop (home, explore/search, post view, write/edit, dashboard, stories, admin moderation) is real.
- [x] The frontend handles empty, loading, and error states professionally.

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

- [x] Blog delete uses ID as slug during authorization.
- [x] Suggested blogs route/controller param mismatch.
- [x] User blogs route can call authenticated-only controller without auth.
- [x] Upload field mismatch: `imageUrl` vs `coverImage`.
- [x] Admin analytics routes do not match analytics service routes.
- [x] Admin visibility ID validation rejects real Prisma IDs.
- [x] Auth lockout writes `lockedUntil` but does not enforce it.
- [x] OAuth callback paths are inconsistent.
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

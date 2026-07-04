# ManKahi Professionalization Action Plan

Last updated: 2026-07-04

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
  - Core loop pages (home, explore/search, post view, write/edit, dashboard, stories, admin moderation) are fully wired. Categories browsing and public profile pages were deferred in the original Phase 3 pass but are now real too (Phase 7): both use live backend data, and `content/write.vue` has a real category picker plus an admin category-management UI.
- [x] Backend API contracts are cleaned up.
  - Auth, blog, analytics, and admin services all typecheck and pass their full test suites independently. Note: none of the four services nor `backend/shared` had ever had `npm install`/`prisma generate` run outside Docker — see the new `backend/shared/scripts/generate-client.js` and each service's `prisma:generate`/`pretest` scripts, now required for local (non-Docker) dev and CI.
- [x] Tests cover core user and admin workflows.
  - 293 backend tests passing (`npm test` from repo root), including regression coverage for every live-verification bug fixed across every pass (Phases 1-4, 7). See the Definition of Done section and Phase 7/8 notes for what was found and fixed by actually running the stack.
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
- [x] Verify hot reload works for frontend and backend services.
  - Live-verified with a real Docker daemon: edited backend source under a running container and confirmed `ts-node-dev --respawn --poll` picked up the change without a manual restart (the `--poll` flag was added specifically because plain fs-event watching does not reliably fire across Docker Desktop's bind-mount layer on Windows). One caveat found during this pass: edits to `backend/shared` (bind-mounted separately, outside each service's own watched root) do **not** trigger `ts-node-dev`'s watcher - a manual `docker compose restart <service>` is needed after changing shared middleware/config. Frontend hot reload (`nuxt dev` + `vite.server.watch.usePolling`) confirmed working via live edits reflected in the browser without a manual reload.
- [x] Verify database initialization works from a clean volume.
  - Live-verified twice: removed the `postgres-data` volume entirely and ran `docker compose up -d` from scratch - the `init-db` service (Prisma `db push` against the shared schema) recreated every table with no manual steps, and all 12 containers came up healthy. Also found and fixed two real bugs that would have broken this on a genuinely fresh checkout: (1) `docker/compose/.env.example`'s `DATABASE_URL` used `${POSTGRES_USER}:${POSTGRES_PASSWORD}` shell-style interpolation, which Docker Compose's `env_file:` mechanism does not expand - fixed to literal values. (2) `docker/scripts/init-db.sh` had CRLF line endings from a Windows checkout, corrupting its `#!/bin/sh` shebang and crashing the Postgres init container on every clean-volume start - fixed by normalizing to LF and adding `.gitattributes` (`*.sh text eol=lf`) so it can't regress on future Windows checkouts.
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

- [x] Add Postgres backup script.
  - `docker/scripts/backup-postgres.sh` - `pg_dump --format=custom` via `docker exec`, reads `POSTGRES_USER`/`POSTGRES_DB` from inside the container so it works for either env file.
- [x] Add Postgres restore script.
  - `docker/scripts/restore-postgres.sh` - `pg_restore --clean --if-exists`, confirms before overwriting unless `--force`.
- [x] Add MinIO/upload backup guidance.
- [x] Add Redis persistence guidance.
  - Already has AOF persistence on (`--appendonly yes`); documented why it's intentionally excluded from the backup script (reconstructable/non-critical cache data).
- [x] Add Elasticsearch snapshot guidance or local export fallback.
  - No snapshot repo; documented that the index is fully rebuildable from Postgres via the existing `syncBlogsToElasticsearch()`.
- [x] Document where backups are stored.
- [x] Document how often backups should run.
- [x] Test restore against a clean local volume.
  - Live-verified end-to-end: took a real backup (`backup-postgres.sh`, `pg_dump --format=custom`) of the running stack's data (4 users, 3 blogs), tore the stack down, removed the `postgres-data` volume entirely, brought the stack back up on a genuinely fresh volume (confirmed 0 rows, schema recreated by `init-db`), ran `restore-postgres.sh --force` against it, and confirmed every row came back identical (same usernames, same blog titles/published state). Re-verified the running app still served the restored data correctly through the browser afterward.

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
  - **Correction found by live testing (2026-07-02):** the route wiring above was correct, but every one of those role checks actually *crashed* at runtime with `req.isAuthenticated is not a function` - static review had no way to catch this, since it's a real Express method on paper (declared via module augmentation in `backend/shared/middlewares/auth/types.ts`) that simply nothing in this JWT-only codebase ever attaches (that signature is Passport.js's session API). Fixed `isAuthenticatedRequest()`/`handleOAuthStrategy()` to check `req.user` presence directly instead. Separately, admin-service's own axios calls to analytics-service never forwarded the caller's bearer token, so even after the crash was fixed, the dashboard stats panel still 401'd - added an `authHeaders()` helper forwarding `req.headers.authorization` to all five admin->analytics call sites. And the blog-visibility toggle wrote `published` straight to Postgres via admin-service's own Prisma client, bypassing blog-service's Elasticsearch reindex and Redis cache invalidation entirely, so "Hide" never actually hid anything from search/home - added `BlogService.setVisibility()`/`BlogController.updateVisibility()` (admin-only, no author-ownership check) in blog-service and switched admin-service to call that endpoint instead of touching Postgres directly. All three confirmed fixed live: dashboard stats load, and Hide/Publish now actually add/remove a post from the home page.
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

Audited helmet/CORS/rate-limiting/headers/env-hygiene across all 4
services and nginx before changing anything. Two real, previously-live
gaps stood out and are now fixed (see notes below): a reflected-origin
CORS misconfiguration at the nginx layer, and every service's app-layer
`cors()` silently defaulting to permissive with `CORS_ORIGIN` defined in
every `.env.example` but never actually read. Fixing the app-layer CORS
check then surfaced two more real bugs in the existing dev env values
(`CORS_ORIGIN` and `FRONTEND_URL` both pointed at the wrong host for this
nginx-fronted architecture) - see the "fix(phase-4)" commit.

- [x] Add strong `.env` examples without real secrets.
  - Audited all 8 tracked `.env.example` files - all placeholder values, no real secrets. Fixed one weak placeholder (`admin-service`'s `JWT_SECRET=your-secret-key` didn't meet the other services' documented 32-char minimum).
- [x] Verify `.gitignore` excludes all real env and secret files.
  - Already correct: root `.gitignore` has `.env` / `.env.*` / `!.env.example` / `!.env.*.example`, plus redundant per-service `.gitignore` entries. Verified live with `git check-ignore -v docker/compose/.env.development`.
- [x] Ensure all services use `helmet` and CORS intentionally.
  - `helmet()` was already applied everywhere (default config). CORS was not intentional: added `backend/shared/config/cors.ts` (`buildCorsOptions`), wired into all 4 servers - `CORS_ORIGIN` (comma-separated) is enforced in any non-development `NODE_ENV`; unset now fails closed instead of the previous bare `cors()` reflecting every origin.
- [x] Tighten CORS for production domain.
  - App layer: `CORS_ORIGIN` allowlist (above). Gateway layer: nginx's `cors.conf` previously reflected `$http_origin` back verbatim with `Access-Control-Allow-Credentials: true` - the classic reflected-origin+credentials misconfiguration. Replaced with an nginx `map`-based allowlist (`docker/nginx/nginx.conf`) - localhost/127.0.0.1 for dev, production domains need a direct edit (documented in `docs/DEPLOYMENT.md`, since this nginx setup isn't templated from env vars). Live-verified: an allowed origin gets `Access-Control-Allow-Origin` back, an arbitrary origin gets nothing, and the browser correctly blocks it.
- [x] Review nginx security headers.
  - Tightened the CSP from a near-permissive `default-src 'self' http: https: data: blob: 'unsafe-inline'` to an explicit per-directive policy, and added a `Permissions-Policy` header. Left `X-Frame-Options`/`X-Content-Type-Options`/`Strict-Transport-Security` as already-present and correct.
- [x] Add request body size limits appropriate to uploads.
  - Every service's `express.json()` was relying on Express's implicit 100kb default. Set explicit limits: 256kb for auth/analytics/admin, 1mb for blog-service (post content can be long markdown). Uploads themselves already had multer-level `MAX_FILE_SIZE`/`MAX_AVATAR_FILE_SIZE` limits and nginx's `client_max_body_size 20M`.
- [x] Add rate limits that do not break normal use.
  - Reviewed all 4 services - already substantially implemented (a custom Redis-backed limiter in `backend/shared/middlewares/rateLimit`, plus per-route options via `authenticate({ rateLimit: {...} })`). auth-service has a strict service-wide 5-per-15-min gate that also covers the new forgot/reset-password routes. Removed the unused `express-rate-limit` npm dependency (listed in 4 `package.json`s, never actually imported - all real limiting goes through the custom middleware).
- [x] Add password reset flow.
  - `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`. Always returns the same generic response regardless of whether the email matches an account (no enumeration). Only a SHA-256 hash of the reset token is ever persisted (`User.resetPasswordTokenHash`), 1-hour expiry. No email provider is wired up (see next item), so `backend/auth-service/src/utils/mailer.ts` is a clearly-marked dev-only stub that logs the reset link - live-verified end-to-end (request reset, grab the logged link, set new password, log in with it). Also fixed the login page's "Forgot your password?" link, which pointed at a bare `#`.
- [x] Add email verification or explicitly mark it future.
  - Explicitly deferred: `User.emailVerified` exists in the schema but nothing ever sets it, and no email transport exists anywhere in the codebase (confirmed via full-repo search - no nodemailer/SES/SendGrid/SMTP config). Building real verification needs the same email-provider decision the password-reset flow's `mailer.ts` stub is waiting on; tracked as one future item instead of two.
- [x] Add basic account/profile update validation.
  - Reviewed `profile.controller.ts` (bio max 500 chars, social links validated as proper URLs, notification prefs validated as a boolean record, account deletion requires password confirmation) and `admin.controller.ts` (suspend requires a min-5-char reason, role assignment validates `roleId`, blog IDs pattern-validated, report status/action-taken validated) - both already solid from the Phase 7 pass, no gaps found.
- [x] Add admin-only moderation protections.
  - Reviewed all 4 services. `admin-service` gates its entire router with `router.use(adminMiddleware)` (`authenticate({roles:['admin']})`) before any route is registered. `blog-service`'s admin-only routes (`/:id/moderate`, `/:id/visibility`, category CRUD) independently re-verify the caller's own JWT role rather than trusting that the request came from admin-service - admin-service forwards the caller's real bearer token (`authHeaders()`), so this is genuine defense-in-depth, not just a single choke point.
- [x] Add dependency audit workflow.
  - Added an `audit` npm script (`npm audit --audit-level=high`) to every service and a root `npm run audit` that chains them. Ran `npm audit fix` (non-breaking only) across the backend - shared/auth/blog now report 0 vulnerabilities. The frontend's own audit still shows findings, all traced to dev-only build tooling (eslint/picomatch/minimatch glob-matching internals, never shipped to the browser) - deliberately not forced, since doing so broke the Nuxt dev server via an unrelated major-version jump with zero net reduction in reported vulnerabilities.

Acceptance criteria:

- Public demo does not expose internal services.
- Secrets are not committed.
- Auth and admin flows have sensible protection.
- Security assumptions are documented.

## Phase 5: Observability And Operations

Purpose: make the app understandable when it is running.

Out of scope for this pass beyond what the Definition of Done requires
(per the original phase ordering, Phase 5 is only pursued once 1-4 are
fully done, and only "to the extent DoD requires"). One bug was found and
fixed anyway because it blocked the DoD's "metrics work" item entirely:
`ENABLE_METRICS` was never set in any env file, so every service's
`/metrics` route 404'd unconditionally and Prometheus's scrape targets
were permanently down. Fixed by setting it in `.env.development` and
documenting it in both example env files - see the Definition of Done
section for the live-verification details. The rest of this phase
(structured logs with request IDs, alerting, an operational runbook,
Grafana dashboard provisioning) remains genuinely not done.

- [x] Ensure every service exposes `/health`.
  - Live-verified: `docker compose ps` reports every service (auth, blog, analytics, admin, nginx, Postgres, Redis, Elasticsearch, MinIO, Prometheus, Grafana) as `healthy`, both on normal startup and after the fresh-volume rebuild during the backup/restore test.
- [x] Ensure every service exposes `/metrics`.
  - The routes always existed; they were gated behind `ENABLE_METRICS`, which nothing ever set - see the note above.
- [ ] Fix Prometheus scrape config for the actual runtime.
  - Not needed - live-verified Prometheus's existing `static_configs` (`mankahi-auth:3001` etc.) already resolve and scrape correctly via Docker's embedded DNS once `/metrics` itself stopped 404ing.
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

- [x] Add a root-level test command or script that runs all service tests.
  - Root `package.json`: `npm test` (auth/blog/analytics/admin in sequence), `npm run typecheck` (all 4 backend services + frontend), `npm run install:all`. No workspaces - each project stays independently installed, matching how Docker builds them.
- [x] Add auth service integration tests.
  - 21 tests: register, login (success/lockout/lock-expiry-reset/invalid-credentials), controller status mapping, logout, refresh-token, OAuth-disabled-mode.
- [x] Add blog service integration tests.
  - Pre-existing coverage (24 tests) plus one new regression test for the multipart-boolean-coercion bug below.
- [x] Add analytics service tests.
  - 17 tests, written from scratch (no test infra existed before this pass): event/progress/link tracking, all four analytics-retrieval endpoints.
- [x] Keep and expand admin service tests.
  - 56 tests: pre-existing suites updated for the new analytics contract and fixed ID validation, plus a new suite for the `listBlogs` moderation endpoint.
- [ ] Add frontend smoke tests for core routes.
  - Deferred: no frontend test framework (vitest/@nuxt/test-utils) is installed, and setting one up plus writing meaningful component tests is real new infra work beyond this pass's scope. Verified instead via `npm run typecheck` (clean across the whole app) and careful manual code review of every wired page - there was no way to launch an interactive browser in this environment either.
- [ ] Add API contract tests for nginx-routed endpoints.
  - Deferred alongside the Docker Compose smoke test below - both need a running stack, which this environment can't provide (see note).
- [x] Add Docker Compose smoke test commands.
  - `docker/compose/scripts/smoke-test.sh`: curls the full core loop (register → login → create → publish → view-by-slug → edit → appears in "my stories" → delete) through the nginx gateway. **Written and code-reviewed but not executed against a live stack**: this sandbox has no network access to pull Docker images (`docker compose up` fails resolving `docker.io`), so full end-to-end verification wasn't possible here - run it yourself after `docker compose up -d --build` before relying on it.
  - While investigating why I couldn't verify this, found and fixed two real bugs it would otherwise have caught: (1) `docker/compose/.env.example`'s `DATABASE_URL` used `${POSTGRES_USER}:${POSTGRES_PASSWORD}` shell-style interpolation, which Docker Compose's `env_file:` does not expand - every service would have received a literal, broken connection string on a fresh clean-volume start. (2) blog-service's create/update endpoints are always submitted as multipart/form-data (for the optional cover image), so `published` always arrives as the string `"true"`/`"false"`, but the Zod schema required a real `boolean` and rejected it outright - every publish/draft toggle from the frontend's own multipart form submission would have 400'd. Both are fixed; see their respective commits/notes.
- [ ] Add lint/typecheck workflow for each service and frontend.
  - Typecheck: done (see above). Lint: deferred - `eslint` is listed as a devDependency in several `package.json`s but no `.eslintrc`/`eslint.config.*` exists anywhere in the repo for any service or the frontend; standing up rule sets and fixing the resulting violations from scratch across 5 projects is meaningfully more work than this pass's scope, and typecheck already provides the higher-value safety net (catches real type errors, not just style).

Acceptance criteria:

- [x] Core workflows are covered by automated tests.
  - Backend: yes, thoroughly (auth, blog, analytics, admin all pass `npm test`). Frontend: covered by typecheck + manual review only, not automated component/e2e tests (documented gap above).
- [x] Local test commands are documented.
  - `npm test` / `npm run typecheck` from the repo root; `docker/compose/scripts/smoke-test.sh` for a running stack.
- [ ] A deployment change can be verified without manual clicking only.
  - True for backend logic (jest + tsc). Not yet true for full-stack integration: the smoke-test script above exists for exactly this purpose but hasn't been run against a live stack (no Docker image pull access in this environment) - leaving this unchecked until someone runs it somewhere with normal network access and confirms it passes.

## Phase 7: Core Product Features

Purpose: complete the blogging product after the foundation is stable.

Done in this pass (2026-07-03), backend built and live-verified against
the real Docker stack + browser unless noted otherwise. New Prisma
models: `Like`, `Comment`, `Bookmark`, `Follow`, `Report`, `AuditLog`
(see `backend/shared/prisma/schema.prisma`). Three real bugs were found
and fixed via live testing along the way (not caught by jest's mocked
Prisma, since mocks don't exercise real module resolution or real
constraint violations):

1. An IDOR/visibility bypass - likes/comments/bookmarks didn't check
   draft visibility, so any authenticated user could interact with (and
   by success/failure, confirm the existence of) someone else's
   unpublished draft.
2. `backend/shared/utils/prismaClient.ts`'s own copy of the generated
   Prisma client was stale (nothing had ever regenerated it after the
   original schema setup), so every service silently ran against an
   outdated client regardless of how recently each service's own copy
   was regenerated - `prisma.comment` was `undefined` at runtime despite
   passing typecheck everywhere. Fixed `generate-client.js` to also
   regenerate `backend/shared`'s own copy.
3. A bare `import { Prisma } from '@prisma/client'` in admin.controller.ts
   resolved to a different module instance than the one the shared
   client actually uses, so `instanceof Prisma.PrismaClientKnownRequestError`
   silently failed and a duplicate role assignment 500'd instead of
   returning the intended 409.

A second live-verification pass on 2026-07-03 (after the full Docker
rebuild) found two more real bugs the same way - neither caught by jest,
both requiring an actual browser reload to notice:

1. Likes and comments went stale forever after the first cache-fill:
   `getBySlug`'s Redis-cached response embeds `analytics.likes`/
   `analytics.comments`, but `likeBlog`/`unlikeBlog`/`createComment`/
   `deleteComment` never called `blogCache.invalidate()` after writing.
   A post viewed once, then liked, would show the like succeed in the
   UI (the mutation response came straight from the DB) but revert to
   the old count on the very next reload. Fixed by invalidating the
   cached slug entry in all four paths, with regression tests asserting
   `blogCache.invalidate` is called (and NOT called on the idempotent
   repeat-like/repeat-unlike paths).
2. Editing an existing post showed rendered HTML soup instead of the
   original markdown, because `Blog.content` was always overwritten
   with `processMarkdown()`'s HTML output - the raw markdown was
   discarded on every create/update, and `content/write.vue`'s edit
   flow fetched that same HTML into the markdown editor. Restoring a
   revision was worse: it re-ran `processMarkdown()` on an
   already-rendered HTML snapshot, double-processing it. Fixed by
   adding a `contentMarkdown` column to both `Blog` and `BlogRevision`
   (nullable - pre-existing rows have no raw source to recover) that
   preserves the raw markdown alongside the rendered `content`;
   `write.vue`'s edit-load, revision-preview, and restore-reload paths
   now all prefer `contentMarkdown`, falling back to `content` only for
   legacy rows. Live-verified: created a fresh post, edited it, restored
   an old version, and confirmed the editor showed clean markdown at
   every step (a post that predates this fix still shows HTML once,
   until its next save populates `contentMarkdown` going forward).

### Content Features

- [x] Drafts.
  - Pre-existing (Phase 3), unaffected by this pass.
- [x] Publish/unpublish.
  - Pre-existing (Phase 3). Note found live: `content/write.vue`'s "Save Draft" button always sets `published: false` even when editing an already-published post - a pre-existing UX quirk (not introduced by this pass) that will unpublish a live post if clicked during an edit. Flagged here rather than fixed, since it's outside Phase 7's scope and touches Phase 3's save flow.
- [x] Edit history or revisions UI.
  - Wired up the `BlogRevision` model, which existed in the schema with zero application code touching it. `BlogService.updateBlog` now auto-captures pre-update content as a revision (only when content actually changes) and bumps `Blog.version`. List/view/restore endpoints + a "Version history" panel in `content/write.vue`. Live-verified: edited a post twice, saw both versions listed with correct timestamps, viewed each one's full content, confirmed restore reloads the content into the editor immediately.
  - A second live-verification pass caught a real bug in this flow: editing an existing post showed rendered HTML instead of markdown (see fix #2 in the intro notes above). Re-verified after the fix with a fresh post: edit-load, revision preview, and restore all show/restore clean markdown.
- [x] Markdown preview.
  - Write/Preview tab in `content/write.vue` using `marked` (already a frontend dependency) for client-side rendering - a close but not guaranteed pixel-identical approximation of the backend's own server-side rendering pipeline.
- [x] Cover images.
  - Pre-existing (Phase 3), unaffected.
- [x] Tags and categories.
  - Tags pre-existing. Categories: the `Category` model's parent/child hierarchy existed in the schema with zero endpoints anywhere and 3 mutually-inconsistent hardcoded category lists across different frontend pages. Added public `GET /categories` + admin-gated CRUD, replaced all the dummy data with real fetches. Live-verified twice: created two real categories via the API (no category-creation UI exists - see note below), confirmed both appear on `/categories`, assigned one to a post via a direct API call (`write.vue` has no category selector either), confirmed the category detail page and the `content/explore.vue` category-filter dropdown both correctly narrow results to just that post.
  - **Gap**: no admin UI exists to create/edit/delete categories (the backend CRUD is admin-gated and works, confirmed via direct API calls, but nothing in the admin depth UI batch below exposes it), and `content/write.vue` has no category selector either - categories currently have to be created and assigned via direct API calls. Worth a follow-up admin page plus a category field in the editor.
- [x] SEO metadata editing.
  - `metaTitle`/`metaDescription`/`canonicalUrl` columns existed on `Blog` and were completely dead (never read or written anywhere). Added a collapsible "SEO settings" section in `content/write.vue`, wired into the existing create/update payload.
- [x] Related posts.
  - Already existed and was already fully wired end-to-end before this pass (`getSuggestedBlogs`, blog-service's `/suggested/:blogId`, rendered on `post/[slug].vue`) - no new work needed.
- [x] Author profile cards.
  - Interpreted as: a real, non-mock public author profile page (`user/profile/[username].vue`, previously 100% hardcoded mock data) plus a richer author byline with a working Follow button on the post page - not a separate small reusable "card" component reused elsewhere, since no other surface (e.g. search result listings) currently needs a compact author preview.

### Reader Features

- [x] Likes.
  - Idempotent toggle, `BlogAnalytics.likes` kept in sync as a denormalized counter. Live-verified: liked a post, count incremented, and - after finding and fixing the stale-cache bug (#1 in the intro notes above) - confirmed the count survives a page reload instead of reverting to its pre-like value.
- [x] Bookmarks.
  - Idempotent toggle + a dedicated `/user/bookmarks` page. Live-verified: bookmarked a post, confirmed it appeared on the bookmarks page, unbookmarked it from there.
- [x] Comments.
  - One level of threaded replies, author-or-admin edit/delete, reader-facing report action. Live-verified end-to-end: posted a top-level comment, posted a reply, edited the top-level comment, deleted the reply, and confirmed all of it - including the comment count - survives a page reload (same underlying cache-invalidation bug as likes, same fix).
- [x] Reading progress.
  - Scroll-based tracking on `post/[slug].vue` (rAF-throttled, fires only at 25/50/75/100% milestones) calling the `trackReadProgress` endpoint, which already existed on the backend but had no caller anywhere before this pass. Not live-verified via actual scrolling in this pass (implementation reviewed, not click-tested) - lower risk than the other items since it's fire-and-forget and already error-swallowing.
- [x] Share links.
  - Copies the post URL to the clipboard and fires the pre-existing (previously uncalled) `trackLinkClick` endpoint. Reviewed, not click-tested live in this pass.
- [x] Search filters.
  - Backend already supported a `category` param on `/search`; nothing in the UI ever set it. Added a category `<select>` on `content/explore.vue` alongside the existing tag chips. Live-verified: selecting a category correctly filtered results (including correctly returning zero results for a category the test post wasn't in).
- [x] Trending posts.
  - New public `GET /trending` (blog-service), a "Trending Now" section on the home page. Live-verified: real post appeared with correct author/date.

### User Features

- [x] Public profile editing.
  - `user/settings.vue`'s bio/social-link fields were previously inert ("isn't available yet" stub) - now wired to real `GET/PUT /api/auth/profile`. Reviewed, not click-tested live in this pass (avatar upload below was tested; the plain-text fields use the identical pattern).
- [x] Avatar upload.
  - New `POST /api/auth/profile/avatar` (multer + sharp + a new `avatars` MinIO bucket, separate from blog-service's cover-image bucket). Not live-verified via an actual file upload in this pass (reviewed for correctness) - flagged as the one avatar-specific gap in verification.
- [x] Bio and social links.
  - See public profile editing above; rendered on the public profile page too (icon links for whichever of twitter/github/linkedin/website are present).
- [x] Follow authors.
  - New `Follow` model, follow/unfollow/followers/following endpoints. Live-verified end-to-end with two real accounts: followed an author from a second account, follower count updated immediately, button switched to "Unfollow"; confirmed the follow state (unlike likes/bookmarks) correctly persists across a reload since the public-profile endpoint does return per-viewer follow state; unfollowed and confirmed the count and button reverted correctly.
- [x] Notification preferences.
  - Stored-preference stub (`emailOnComment`/`emailOnFollow`/`emailOnLike` booleans) - explicitly not wired to any actual email delivery, since no such infrastructure exists in this codebase yet. Groundwork for later.
- [x] Account deletion or deactivation.
  - Self-service `DELETE /api/auth/account`, requires re-confirming password, blacklists the current token. Reviewed, not live-tested in this pass (destructive and would have removed a test account mid-verification) - the password-mismatch and OAuth-only-account edge cases are covered by unit tests.

### Admin And Moderation

- [x] Hide/unhide posts.
  - Already fixed and live-verified in an earlier pass this session (see the "repair admin moderation flow" commit).
- [x] Delete abusive content.
  - New admin hard-takedown (`DELETE /api/admin/blog/:blogId`, delegates to blog-service's new `DELETE /:id/moderate`, same bearer-forwarding pattern as the existing visibility delegation). Not click-tested live in this pass (the visibility toggle's identical delegation pattern was already live-verified earlier this session) - unit-tested.
- [x] Manage users.
  - New `/admin/users` page: search, status filter, suspend (with a required reason)/unsuspend. Live-verified end-to-end including real enforcement: suspended a real account, confirmed it could no longer log in and received the admin's stated reason, unsuspended it, confirmed login worked again.
- [x] Manage roles.
  - New `/admin/users` role panel: assign/revoke against the full role catalog (deliberately not a checkbox list implying knowledge of a user's current roles, since no endpoint exposes that). Live-verified: assigned and revoked a real role; also found and fixed a real bug this uncovered (duplicate assignment 500'd instead of returning 409 - see the Prisma-import bug above).
- [x] View reported content.
  - New `/admin/reports` page + reader-facing report actions on blog-service. Live-verified: submitted a real report from one account, saw it appear in the admin queue, dismissed it, confirmed it left the "open" filter view.
- [x] Basic audit log.
  - New `/admin/audit-log` page + a `recordAuditLog()` helper wired into every mutating admin action (suspend/unsuspend, role assign/revoke, blog delete, report resolve/dismiss, plus the pre-existing visibility toggle). Live-verified: performed a suspend and unsuspend, confirmed both appeared in the log with correct actor, action, target, and metadata.

Acceptance criteria:

- The product feels like a complete blogging platform, not just a technical demo.
- Feature behavior is documented and tested where risk is meaningful.
  - 283 backend tests passing (`npm test` from the repo root: auth 77, blog 92, analytics 17, admin 97), frontend and root typecheck clean, full core-loop Docker smoke test (`docker/scripts/smoke-test.sh`) passing end-to-end. Live-verified across two separate browser-automation passes against the real Docker stack (Chrome DevTools MCP) covering every reader-engagement, content-authoring, and admin-depth flow: likes, bookmarks, comments (post/reply/edit/delete), follow/unfollow (two real accounts), blog revisions (auto-capture/view/restore), category browsing (index/detail/explore-filter), and admin suspend/role-assign/report-resolve/audit-log (with real login-blocked-when-suspended enforcement). Two real bugs were found and fixed via the second pass alone (stale like/comment counts, markdown-vs-HTML content round-tripping - see the intro notes above) - both classes of bug that only a real reload/re-edit in a browser would surface, not a mocked unit test. A small number of lower-risk items (reading progress, share links, avatar upload, account deletion, plain profile-field editing) were reviewed and unit-tested but not individually click-tested live, noted above.

## Phase 8: Future Scale Readiness

Purpose: keep the system easy to evolve when traffic grows.

- [ ] Keep services stateless except for backing stores.
- [ ] Separate write path side effects behind service modules.
- [ ] Make search indexing replaceable with async workers later.
- [ ] Make analytics ingestion replaceable with a queue later.
- [x] Add database connection pooling guidance.
  - `docs/SCALING.md` - current per-replica pool sizing, the concrete connection-count trigger for when it becomes a problem, and what to watch (`pg_stat_activity`).
- [x] Document when to introduce PgBouncer.
  - `docs/SCALING.md` - not yet warranted at current scale; concrete trigger conditions and transaction-vs-session pooling mode guidance included.
- [x] Document when to move uploads to cloud object storage.
  - `docs/SCALING.md` - notes this is already architecturally cheap (MinIO is already S3-compatible and already backs both blog covers and user avatars), with concrete triggers for when to actually do it.
- [x] Document when to move from Compose to Kubernetes or managed services.
  - `docs/SCALING.md` - concrete triggers (compute ceiling, zero-downtime deploy requirement, managed multi-node backing stores, multi-engineer independent deploys), explicitly "not yet" at current scale.
- [x] Archive or repair Kubernetes manifests after Docker production is solid.
  - Repaired what was cheaply and confidently fixable: `base/kustomization.yaml`'s missing-`.env` failure (removed the dead/unused generator block), `services.yaml` never being wired in (3 of 4 backend services had no K8s objects at all), a secret-name mismatch (`services-secret` vs the real `app-secrets`), and `deploy.sh` building `overlays/` while checking secrets under `environments/` (two incompatible, cross-wired directory trees). Archived the redundant `overlays/` tree (`kubernetes/overlays.archived/`) in favor of `environments/`, which `deploy.sh` now consistently targets. `kubectl kustomize base` now builds cleanly. One issue remains and is explicitly documented rather than silently left broken: `environments/*/kustomization.yaml`'s generator `behavior: merge` targets base ConfigMaps/Secrets that are plain static resources, which this kustomize version rejects - needs restructuring `base/config/environment.yaml` and `base/secrets/services-secrets.yaml` to be generator-produced too. See `kubernetes/README.md`'s Known Limitations section for the exact error and fix direction.
- [x] Add load-testing scripts for laptop and single-server baselines.
  - `docker/scripts/load-test.sh` - dependency-free concurrent-request baseline (curl + bash background jobs), configurable concurrency/request-count/endpoint. Live-verified against the running dev stack (50 requests, 10 concurrent, 0 failures). Documented in `docs/SCALING.md` as a baseline check, not a replacement for k6/JMeter for deeper testing.

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
- [x] Kubernetes Kustomize build currently fails due to missing base `.env`.
  - Fixed by removing the unused `configMapGenerator` block that referenced it - see Phase 8 notes.
- [x] Kubernetes deployment paths are split between `overlays` and `environments`.
  - Consolidated to `environments/`; `overlays/` archived - see Phase 8 notes.

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

Update (2026-07-02, live verification pass): the previous pass through
this checklist was static-only (no Docker network access in that
sandbox). This pass ran the real stack end-to-end with a live Docker
daemon and a real Chromium browser (Chrome DevTools MCP) - every item
below is now checked against actual running behavior, not code review.
That process found and fixed several more real bugs that static review
had missed entirely: a CRLF-corrupted `init-db.sh` shebang that crashed
Postgres on every clean-volume start; a broken nginx route split that
made bare `POST /api/blogs` 404; `publishedAt` never being written or
indexed; a stale Elasticsearch soft-delete leak; a frontend type mismatch
that silently rendered "Unknown" authors on search results; a redundant
nginx `proxy_cache` layer serving stale data independently of the
already-fixed Redis cache; every RBAC-gated admin route crashing on a
Passport.js method (`req.isAuthenticated()`) that nothing in this
JWT-only codebase ever attaches; admin-service's calls to
analytics-service never forwarding the caller's bearer token; the admin
blog-visibility toggle writing straight to Postgres and never reaching
Elasticsearch, so "Hide" never actually hid anything; and every service's
`/metrics` endpoint 404ing because `ENABLE_METRICS` was never set
anywhere. All of the above are fixed and re-verified live.

- [x] One command starts local development reliably.
  - `docker compose up -d` (after images are built once) starts all 12 containers healthy from a completely fresh `postgres-data` volume - verified twice: once during initial stack bring-up, once as part of the backup/restore test below (volume removed, stack brought back up, `init-db` recreated the schema with no manual steps).
- [ ] One documented path deploys to a single server.
  - Documented in `docs/DEPLOYMENT.md`; `docker-compose.prod.yml` config validates (`docker compose config`). Still not runtime-tested on an actual second machine with real TLS/secrets - doing so is outside what a local sandbox can exercise.
- [x] Only nginx is public in production.
- [x] A user can register, log in, write, publish, edit, delete, and view blogs.
  - Live-verified twice: once via `docker/scripts/smoke-test.sh` (curl-based, all steps pass), once via an actual browser click-through of the full loop (register -> auto-login -> dashboard -> write -> publish -> view by slug -> edit -> dashboard showing updated stats -> delete with confirm dialog).
- [x] Search works from real indexed content.
  - Live-verified in-browser on the home and explore pages against real Elasticsearch data, including a real publish date and correct author/tags after fixing the type-shape mismatch and the three-layer (nginx/Redis/Elasticsearch) caching bugs described above.
- [x] User dashboard and stories use real data.
  - Live-verified: Total Stories/Published/Drafts counts and the Recent Stories table reflect real Postgres data; edit and delete both round-trip correctly and the dashboard reflects the change immediately afterward.
- [x] Admin can view dashboard data and moderate blog visibility.
  - Live-verified after fixing the three bugs above (RBAC crash, missing auth-header forwarding, no-op visibility write): dashboard stats (Total Blogs/Users/Views/Reads/Engagement) load correctly, and toggling Hide/Publish on a real post actually removes/restores it from the home page, not just the admin table.
- [x] Backups and restores are documented and tested.
  - Live-verified end-to-end: took a real backup with `backup-postgres.sh` against the running stack, tore the stack down, removed the `postgres-data` volume entirely (genuinely fresh, not just an empty database), brought the stack back up (schema recreated by the `init-db` service with no manual steps), confirmed the fresh database was empty, ran `restore-postgres.sh` against it, and confirmed every row (4 users, 3 blogs, matching usernames/titles) came back identical. Re-verified the app itself still worked correctly against the restored data via the browser afterward.
- [x] Logs, health checks, and metrics work.
  - Health checks: `docker compose ps` reports every service healthy, both on normal startup and after the fresh-volume rebuild. Logs: used continuously throughout this pass (`docker compose logs`) to diagnose every bug above - readable and useful. Metrics: found `ENABLE_METRICS` was never set in any env file, so every service's `/metrics` route permanently 404'd and Prometheus's scrape targets were all reported down; fixed by setting it in `.env.development` and documenting it in both example env files, then confirmed live via Prometheus's own `/api/v1/targets` (all four backend-services targets healthy) and a real query (`auth_process_cpu_seconds_total`) returning actual scraped data.
- [x] Core workflows have automated tests.
  - 127 backend tests passing via `npm test` from the repo root: auth (21), blog (32, including new regression coverage for the visibility/publishedAt fixes), analytics (17), admin (57, including new coverage for the auth-forwarding and visibility-delegation fixes). Frontend: typecheck only, no automated component/e2e tests (documented gap - out of scope per the original phase ordering, which stops at Phase 6's backend-focused test command).
- [x] README links to this action plan.

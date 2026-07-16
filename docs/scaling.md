# ManKahi Scaling Guidance

## Purpose

This document covers future scale readiness. It does not describe changes made to the running system - it
describes concrete, measurable triggers for *when* to make each change,
so scaling decisions are made in response to real evidence rather than
speculatively. The local stack (Docker Compose, one Postgres instance,
one Redis instance, one Elasticsearch node) is intentionally sized for a
laptop-to-single-server deployment; none of the migrations below should
be started before their trigger condition is actually observed.

## Current Statelessness

All four backend services (auth, blog, analytics, admin) are already
stateless: no in-memory session state, no local file storage for
anything that must survive a restart (uploads go to MinIO, not local
disk), and horizontal scaling today is just "run more container
replicas behind the same nginx upstream block." This is why Docker
Compose's `deploy.replicas` (development) and the compose file can be
increased directly with no code changes,
and why the Kubernetes manifests in `kubernetes/` (scaffolding, see
`kubernetes/README.md`) already model each service as a `Deployment`
with a `HorizontalPodAutoscaler` rather than a `StatefulSet`.

The two async side effects that currently run inline in the request path
- Elasticsearch indexing (`indexBlog`/`updateBlogIndex` in
`backend/blog-service/src/utils/elasticsearch.ts`, called synchronously
from `blog.service.ts`'s create/update/delete) and analytics ingestion
(`analyticsClient` calls in `blog-service`'s middleware, and
`analytics-service`'s direct-write `trackEvent`/`trackProgress`/
`trackLinkClick` controllers) - are the two places most likely to need
to move behind a queue as write volume grows. See the sections below for
when.

## Database Connection Pooling

**Current state:** each service instance opens its own Prisma connection
pool directly against Postgres (no pooler in front of it). Prisma's
default pool size is `num_cpus * 2 + 1` per client instance - with 4
backend services at 1 replica each in development, that's a handful of
connections; Postgres's own default `max_connections` (100) comfortably
covers this.

**When this becomes a problem:** `(number of service replicas) x
(Prisma's per-instance pool size)` approaching Postgres's
`max_connections`. Concretely: once you're running more than roughly
15-20 total backend replicas across all four services (e.g. 5x blog-service
+ 5x auth-service + 5x analytics-service + 5x admin-service, matching the
Kubernetes manifests' example replica counts in `kubernetes/base/services.yaml`),
you're at real risk of Postgres refusing new connections during a
deploy (when old and new replicas briefly coexist) or a traffic spike.

**What to watch:** Postgres's `pg_stat_activity` connection count over
time (`SELECT count(*) FROM pg_stat_activity;`), or Prometheus's
`pg_stat_activity_count` if a `postgres_exporter` is added later. Alert
before you hit `max_connections`, not after.

**Fix, in order of effort:**
1. Lower Prisma's per-service pool size via `connection_limit` on
   `DATABASE_URL` (e.g. `?connection_limit=5`) if replicas are numerous
   but per-replica traffic is low - free, no new infrastructure.
2. Raise Postgres's `max_connections` (costs memory - each connection
   reserves ~5-10MB) if you have headroom.
3. Introduce PgBouncer (see below) once (1) and (2) together aren't
   enough, or once connection *churn* (not just count) is the problem -
   e.g. many short-lived serverless/edge-function-style callers rather
   than a fixed number of long-running service replicas.

## When To Introduce PgBouncer

Not yet warranted at the current scale (single Postgres instance, a
handful of long-lived service replicas each holding a stable connection
pool). Introduce it when either is true:
- Connection *count* pressure per the section above, after the cheaper
  fixes (Prisma `connection_limit`, raising `max_connections`) are
  exhausted.
- Connection *churn* pressure: if any component starts opening/closing
  Postgres connections per-request rather than holding a pool (this
  would be a regression from the current architecture, not something
  planned - Prisma's client is meant to be instantiated once per
  process and reused, exactly as `backend/shared/utils/prismaClient.ts`
  already does).

If/when it's warranted: run PgBouncer in `transaction` pooling mode (not
`session` mode - Prisma doesn't use session-level features like
`LISTEN`/`NOTIFY` or advisory locks that would require it) as a sidecar
or a small dedicated service in front of Postgres, and point
`DATABASE_URL` at it instead of Postgres directly. No application code
changes needed beyond the connection string.

## When To Move Uploads To Cloud Object Storage

**Current state:** MinIO (S3-compatible) already backs both blog cover
images (`backend/blog-service/src/config/upload.ts`) and user avatars
(`backend/auth-service`'s equivalent, added in a later feature
batch) - uploads are not stored on local disk anywhere in the running
services. This means the "move to cloud object storage" migration is
already architecturally cheap: it's a matter of pointing the existing
S3-compatible client at a real provider, not a rewrite.

**When to actually do it:** when either is true:
- You move off a single server (MinIO's data lives in a Docker named
  volume tied to that one machine - it doesn't survive a
  single-server-to-multi-server migration on its own without adding
  MinIO's own distributed/erasure-coded mode, which is itself
  operationally heavier than just using a managed provider).
- The `minio-data` volume's disk usage or backup time becomes a genuine
  operational burden on the single server (uploads competing with
  Postgres/Elasticsearch for disk I/O or backup windows).

**How:** update `MINIO_ENDPOINT`/`MINIO_PORT`/`MINIO_ACCESS_KEY`/
`MINIO_SECRET_KEY`/`MINIO_USE_SSL`/`MINIO_REGION` to point at the new
provider (AWS S3, Cloudflare R2, Backblaze B2, or a managed MinIO
cluster) - every service already reads these as env vars, no code
changes required as long as the provider is S3-API-compatible (all of
the above are). Migrate existing objects with any S3-to-S3 sync tool
(e.g. `rclone`) before cutting over.

## When the local Compose stack stops being enough

(Production already runs on Kubernetes - this concerns the local/dev stack.)

**Not yet.** Docker Compose on a single server remains the right choice
until at least one of these is true:
- You need more compute than a single server can provide (vertical
  scaling of one machine has stopped being viable or cost-effective).
- You need zero-downtime deploys with automated rollback, which Compose
  doesn't provide natively (a `docker compose up -d --build` briefly
  disrupts the service being rebuilt; Kubernetes rolling updates don't).
- You need a backing store (Postgres, Elasticsearch) to run as a
  genuinely managed multi-node cluster with automatic failover, which
  is easier to operate via Kubernetes operators (or a managed cloud
  database service, which is worth considering *instead of* Kubernetes
  for just this piece) than by hand in Compose.
- Multiple engineers need to deploy independently without stepping on
  a single shared server.

None of these apply to the local Compose stack at the project's current
scale. The platform already runs in production on Kubernetes (k3s on OCI,
managed via GitOps) - see [oci-deployment.md](./oci-deployment.md) for the
cluster and infrastructure, and [gitops.md](./gitops.md) for the Argo CD +
SealedSecrets workflow. What follows are larger-scale reconsiderations
beyond the current 2-node cluster, not "first deploy" work: most notably,
deciding on managed vs. self-hosted Postgres/Elasticsearch as a genuinely
managed multi-node cluster with automatic failover becomes warranted, since
running stateful clusters well inside Kubernetes is a significant
operational commitment in its own right that a managed cloud database
service often sidesteps entirely.

## When To Move Search Indexing Behind A Queue

**Current state:** `blog-service`'s create/update/delete/visibility paths
call `indexBlog()`/`updateBlogIndex()` (`backend/blog-service/src/utils/elasticsearch.ts`)
synchronously and inline, awaited as part of the same request that
mutates Postgres. This is already isolated behind its own module (not
scattered ad hoc through the controller), which is what makes it cheap
to move behind a queue later without touching call sites' business logic:
only `blog.service.ts`'s awaited calls become "enqueue a job" calls.

**When this becomes a problem:** Elasticsearch indexing latency starts being
visible in the write-path's own response time (check
`blog_database_operation_seconds`-adjacent request duration for
create/update/delete routes specifically). Outage-safety is already
handled: the indexing call is guarded by a circuit breaker (best-effort,
non-blocking on failure, capped by a per-call timeout), so an Elasticsearch
outage degrades search rather than failing or stalling a blog save (see
[resilience.md](resilience.md)). Latency under load is the remaining reason
to queue, and it isn't a factor at current traffic - a single-node
Elasticsearch instance indexes a single document fast enough that it
doesn't materially affect request latency.

**What it would look like:** since Redis is already a running dependency
for every service, the lowest-new-infrastructure path is a Redis-backed
job queue (e.g. BullMQ, which is a thin layer over Redis) rather than
introducing Kafka/RabbitMQ purely for this. `blog.service.ts` would push
a `{action, blogId}` job instead of awaiting `indexBlog()` directly; a
worker process (can start as an in-process consumer inside blog-service
itself, doesn't need a new deployable) drains the queue. The existing
`syncBlogsToElasticsearch()` re-sync path (already relied on for full
Elasticsearch rebuilds, see the Backups And Restore section of
`docs/local-development.md`) doubles as the recovery path if a job is ever
lost (now reachable via the admin `POST /api/blogs/search/reindex` endpoint
— see [resilience.md](resilience.md) section 6).

## When To Move Analytics Ingestion Behind A Queue

**Current state:** `analytics-service`'s `trackEvent`/`trackProgress`/
`trackLinkClick` controllers write directly to Postgres (`prisma.analyticsEvent.create`)
and Redis on every call, in the same request/response cycle as the
client's fire-and-forget tracking beacon.

**When this becomes a problem:** write volume high enough that Postgres
write throughput or connection pool pressure from analytics events
starts competing with the auth/blog services' own database load (they
share one Postgres instance today), or analytics traffic spikes (e.g. a
post going viral) need to be absorbed without backpressure affecting
reader-facing latency elsewhere.

**What it would look like:** same Redis-backed queue approach as search
indexing above - the tracking endpoints already return immediately
without depending on the write completing (the frontend never awaits a
meaningful response body from these calls), so switching them to enqueue
instead of write-directly is a behavior-preserving change from the
client's perspective. A separate worker (or a batched consumer that
writes in bulk every few seconds) then drains the queue into Postgres,
which also opens the door to batching many events into fewer INSERTs -
a throughput win independent of the queue itself.

## Load Testing

`docker/scripts/load-test.sh` (added alongside this document) runs a
lightweight concurrent-request baseline against a running stack using
only `curl` and standard shell tools (no new dependency to install) -
intentionally simple, meant to answer "does this server fall over under
N concurrent users hitting the core read paths," not to replace a real
load-testing tool. For deeper testing (sustained load, realistic user
flows, distributed load generation), reach for [k6](https://k6.io/) or
[Apache JMeter](https://jmeter.apache.org/) - deliberately not bundled
here, since which tool fits depends on what you're specifically trying
to learn (single-server ceiling vs. multi-service bottleneck
identification vs. database-specific tuning).

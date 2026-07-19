# ManKahi Alerting

Scope: the local Docker Compose stack. Production alerting (Prometheus rules,
Grafana unified alerting, Discord delivery) is live and documented in
[operations.md](./operations.md) section 4.

This document lists concrete alert conditions for the local Compose stack.
There is no Alertmanager (or any alert-firing system) wired up in the local
Compose stack yet - Prometheus and Grafana are deployed there for scraping
and visualization only. The queries below
are meant to be pasted into Grafana Alerting rules (Grafana can alert
directly off its own Prometheus datasource without Alertmanager) or into a
Prometheus `rule_files` entry plus Alertmanager if one is added later.

Every query is written against metrics that are actually exposed today -
verified live against a running stack on 2026-07-04. Where a category
(disk, host CPU) isn't instrumented at all, that gap is stated explicitly
rather than presented as covered.

## What's actually instrumented right now

- Every backend service (`auth`, `blog`, `analytics`, `admin`) exposes
  `/metrics` (Prometheus text format, gated by `ENABLE_METRICS=true`) with:
  - HTTP request rate/duration/size, per method+route+status (`<service>_http_*`)
  - Error counts (`<service>_errors_total`)
  - Database operation duration (`<service>_database_operation_seconds`)
  - Cache operation duration (`<service>_cache_operation_seconds`)
  - Node.js process metrics via `prom-client`'s default collector
    (`<service>_process_resident_memory_bytes`, `<service>_nodejs_eventloop_lag_seconds`,
    `<service>_nodejs_heap_size_used_bytes`, `<service>_nodejs_gc_duration_seconds`, etc.)
- Prometheus itself tracks `up{job="backend-services", instance="mankahi-auth:3001"}`
  (and the same for blog/analytics/admin) - this is free, built-in, and does
  not depend on the app emitting anything: it's Prometheus's own scrape
  health for each target.
- Postgres, Redis, Elasticsearch, MinIO, and the 4 backend services all have
  Docker Compose `healthcheck:` blocks, visible via `docker compose ps`.

## What is NOT instrumented (by design, local Compose only)

- **Host/container CPU, memory, and disk usage** - there is no
  node-exporter or cAdvisor in the compose stack, so there is no Prometheus
  metric for actual host CPU load, RAM usage, or disk space. The only
  available signal is `docker stats` run manually, or the OS's own
  monitoring. If host-level alerting matters before this is added, use an
  external tool (e.g. a cron job checking `df -h` / `free -m` and alerting
  via email/webhook) rather than Prometheus.
- **Postgres/Redis/Elasticsearch internal metrics** - there is no
  `postgres_exporter`, `redis_exporter`, or Elasticsearch metrics beat.
  Only the Docker healthcheck's up/down state is visible, not connection
  counts, replication lag, slow queries, disk usage inside the DB, etc.
- **Alertmanager** - nothing in the local Compose stack currently sends a
  notification anywhere (production delivers via Grafana alerting to
  Discord - see operations.md). The rules below are conditions to alert
  *on* locally, not alerts that fire today in Compose.

The local Compose stack scopes out `node-exporter` (host metrics),
`cadvisor` (per-container CPU/mem/disk), `postgres_exporter`, and
`redis_exporter`: this stack is for local development, not a monitored
environment, and those exporters plus wiring Grafana Alerting or an
Alertmanager container with `docker/prometheus/alert.rules.yml` are what
adding that coverage would take, if it's ever needed here.

## Recommended alert conditions

### Service failures

```promql
# A backend service's /metrics endpoint is unreachable for 2 straight scrapes (30s)
up{job="backend-services"} == 0
```
Severity: critical. This is the single highest-value alert available today -
it fires within one scrape interval (15s) of a container crashing, hanging,
or failing its health check hard enough to stop responding.

```promql
# Elevated 5xx rate on any service, any route, over a 5m window
sum by (job) (rate(auth_http_requests_total{status_code=~"5.."}[5m]))
  + sum by (job) (rate(blog_http_requests_total{status_code=~"5.."}[5m]))
  + sum by (job) (rate(analytics_http_requests_total{status_code=~"5.."}[5m]))
  + sum by (job) (rate(admin_http_requests_total{status_code=~"5.."}[5m]))
  > 1
```
Severity: warning at >1 5xx/sec sustained for 5m, critical at >10/sec.
Tune the threshold once real production traffic volume is known.

### Application errors

```promql
# Error rate per service climbing, independent of HTTP status
rate(auth_errors_total[5m]) > 0.5
rate(blog_errors_total[5m]) > 0.5
rate(analytics_errors_total[5m]) > 0.5
rate(admin_errors_total[5m]) > 0.5
```
Severity: warning. These counters increment on caught application errors
(see each service's `metrics.trackError()` call sites), which is a wider
net than HTTP 5xx alone (e.g. a caught error that still returns a 4xx).

### Latency

```promql
# p95 request latency above 1s for any route, sustained 5m
histogram_quantile(0.95, rate(auth_http_request_duration_seconds_bucket[5m])) > 1
histogram_quantile(0.95, rate(blog_http_request_duration_seconds_bucket[5m])) > 1
histogram_quantile(0.95, rate(analytics_http_request_duration_seconds_bucket[5m])) > 1
histogram_quantile(0.95, rate(admin_http_request_duration_seconds_bucket[5m])) > 1
```
Severity: warning. 1s is a starting point, not a validated SLO - revisit
once real usage data exists.

### Memory (process-level, not host-level)

```promql
# Node.js resident memory approaching each service's Compose memory limit.
# Dev compose has no limits; prod compose caps auth/analytics/admin at 1G,
# blog at 2G (docker-compose.prod.yml). Alert at 80% of that cap.
auth_process_resident_memory_bytes > 0.8 * 1024 * 1024 * 1024
blog_process_resident_memory_bytes > 0.8 * 2 * 1024 * 1024 * 1024
analytics_process_resident_memory_bytes > 0.8 * 1024 * 1024 * 1024
admin_process_resident_memory_bytes > 0.8 * 1024 * 1024 * 1024
```
Severity: warning. If a container hits its hard memory limit, Docker OOM-kills
it - this alert is meant to catch a leak before that happens. Update the
thresholds if `docker-compose.prod.yml`'s `deploy.resources.limits.memory`
values change.

### Event loop health (Node.js-specific early-warning signal)

```promql
# Sustained event loop lag means the service is blocked/overloaded even if
# HTTP latency alerts haven't tripped yet
auth_nodejs_eventloop_lag_p99_seconds > 0.1
blog_nodejs_eventloop_lag_p99_seconds > 0.1
analytics_nodejs_eventloop_lag_p99_seconds > 0.1
admin_nodejs_eventloop_lag_p99_seconds > 0.1
```
Severity: warning.

### Database health

```promql
# Slow database operations (p95 over 500ms)
histogram_quantile(0.95, rate(auth_database_operation_seconds_bucket[5m])) > 0.5
histogram_quantile(0.95, rate(blog_database_operation_seconds_bucket[5m])) > 0.5
histogram_quantile(0.95, rate(analytics_database_operation_seconds_bucket[5m])) > 0.5
histogram_quantile(0.95, rate(admin_database_operation_seconds_bucket[5m])) > 0.5
```
Severity: warning. This measures the app's *experience* of the database
(query duration as seen by Prisma call sites), not the database's own
internal state - real DB-side monitoring needs `postgres_exporter` (see gap
above).

For actual Postgres availability today, rely on the Compose healthcheck:
```bash
docker compose ps postgres   # STATUS column shows "healthy"/"unhealthy"
```
A restart-policy-driven container flapping (repeated Restarting/unhealthy
in `docker compose ps`) is itself a usable manual-check signal until
`postgres_exporter` exists.

### Search circuit breaker

```promql
# blog-service ES breaker OPEN — search serving degraded results
mankahi_es_breaker_state == 2
```
Severity: warning. This mirrors the production `ESCircuitBreakerOpen` rule
(operations.md section 4).

### Rate limiting / abuse signals

```promql
# Spike in rate-limit rejections can mean either abuse or a misbehaving client
rate(auth_rate_limit_hits_total[5m]) > 5
```
Severity: informational/warning depending on volume - useful context during
an incident, not necessarily worth paging on by itself.

## Priority if only implementing a few of these

1. `up == 0` (service down) - highest value, zero new instrumentation needed.
2. 5xx rate and error rate - catches real user-facing breakage.
3. Memory approaching the Compose limit - catches leaks before an OOM kill.
4. Everything else - useful, but lower urgency than the above three.

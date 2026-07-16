# Search Resilience: Elasticsearch Circuit Breaker

## 1. What this document is

blog-service's search feature depends on Elasticsearch. This document
describes the circuit breaker that guards every call blog-service makes to
Elasticsearch, the user-visible contract when Elasticsearch is unavailable,
what happens to writes during an outage, the metrics and alert that expose
breaker state, and two chaos drills (local Compose and cluster) that exercise
the whole path end to end.

The public search endpoint is `GET /api/blogs/search` (routed through the
gateway at `/api/blogs/search`, proxied to blog-service's `/search`).

## 2. Design overview

All blog-service access to Elasticsearch goes through a single choke point,
`guardedEs()` in `backend/blog-service/src/utils/elasticsearch.ts`. Every
indexing call (`indexBlog`, `updateBlogIndex`, `removeBlogFromIndex`) and the
search call (`searchBlogsElastic`) is wrapped by `guardedEs`, which delegates
to an in-process `CircuitBreaker` instance (`backend/shared/utils/circuitBreaker.ts`).

The breaker is a standard three-state machine:

- **CLOSED** — calls pass through normally. Consecutive failures are
  counted; once the count reaches the failure threshold, the breaker trips
  to OPEN.
- **OPEN** — calls are short-circuited immediately (no call is attempted
  against Elasticsearch). The breaker stays OPEN until a reset window has
  elapsed.
- **HALF_OPEN** — the first call after the reset window is allowed through
  as a single probe. Success closes the breaker and resets the failure
  count; failure re-opens it immediately and restarts the reset window.

Two implementation details are load-bearing:

- **Lazy reset, no background timer.** The breaker does not poll or run a
  timer to flip itself from OPEN to HALF_OPEN. The reset deadline is checked
  only when a call is attempted. Consequence: with zero search traffic, the
  breaker state — and the `mankahi_es_breaker_state` gauge — stays pinned at
  "open" indefinitely; it only advances to HALF_OPEN when the next call
  actually probes it. This is expected behavior, not a bug, and it matters
  for interpreting the gauge during low-traffic windows.
- **Per-call timeout via `Promise.race`.** Elasticsearch outages more often
  present as a hang (connection accepted, response never arrives) than a
  fast connection error, so every guarded call races against a timer
  (`ES_BREAKER_CALL_TIMEOUT_MS`) and is treated as a failure if the timer
  wins. Without this, a single hung request could block the failure count
  from ever incrementing.
- **Single-probe HALF_OPEN.** Only one call is allowed through while
  HALF_OPEN; a second concurrent call arriving before the probe settles is
  short-circuited rather than allowed to pile onto the recovering backend.

## 3. Trade-off record: in-house breaker vs. opossum

The breaker is a small, dependency-free class rather than the `opossum`
library. This was a deliberate choice: the state machine needed here
(consecutive-failure trip, lazy reset, per-call timeout, single-probe
half-open) is small enough to own outright and unit-test in isolation,
and writing it in-house avoids adding a new item to the dependency
supply chain for behavior that amounts to a few dozen lines.

`opossum` remains the documented alternative if requirements outgrow this
implementation — for example rolling-window failure-rate statistics (as
opposed to a simple consecutive-failure count), event-emitter-based
instrumentation, or bulkheading multiple breakers with shared configuration.
If a future need surfaces along those lines, evaluate `opossum` before
extending the in-house class further.

## 4. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ES_BREAKER_FAILURE_THRESHOLD` | `5` | Consecutive failures (CLOSED state) before the breaker trips to OPEN. |
| `ES_BREAKER_RESET_TIMEOUT_MS` | `30000` | How long the breaker stays OPEN before allowing a HALF_OPEN probe. |
| `ES_BREAKER_CALL_TIMEOUT_MS` | `2500` | Per-call timeout; a call that exceeds this is treated as a failure regardless of what Elasticsearch eventually returns. |

Defaults live in code (`backend/blog-service/src/utils/elasticsearch.ts`), not
in a checked-in config file. Values are read from the environment as
integers; a value that is missing, non-numeric, or non-positive falls back
to the default and logs a warning naming the offending variable.

**Load-bearing invariant: `ES_BREAKER_CALL_TIMEOUT_MS` must remain strictly
less than `ES_BREAKER_RESET_TIMEOUT_MS`.** The per-call timeout guarantees
that every call admitted by the breaker settles (success, error, or timeout)
before a new reset window can open. This is what keeps a stale in-flight
call from resolving after a HALF_OPEN probe has already started and
corrupting that probe's accounting. Do not raise the call timeout without
raising the reset timeout to stay above it, and do not lower the reset
timeout below the call timeout.

## 5. Degraded contract (what callers of search see)

When Elasticsearch is unreachable or the breaker is OPEN, `GET
/api/blogs/search` still returns **HTTP 200**, with a body of the shape:

```json
{
  "blogs": [],
  "total": 0,
  "page": 1,
  "totalPages": 0,
  "degraded": true,
  "reason": "search_unavailable"
}
```

`page` reflects the page that was actually requested. The frontend renders
this the same way it renders a genuinely empty result set (its normal empty
state) — there is no dedicated degraded-mode UI today.

Degraded responses are never cached: the search cache write only happens
after a successful Elasticsearch call, so a degraded response this second
does not poison the cache for a healthy retry a moment later.

Everything else — reading a single blog by slug, comments, likes,
bookmarks, categories, user blog listings, and all writes — is backed by
Postgres/Redis, not Elasticsearch, and is unaffected by an Elasticsearch
outage.

## 6. Write path during an outage

Publishing or editing a blog is a database write followed by a best-effort
attempt to update the Elasticsearch document. During an outage:

- The database write commits normally — creating, editing, or deleting a
  blog succeeds from the caller's point of view.
- The corresponding `indexBlog` / `updateBlogIndex` / `removeBlogFromIndex`
  call goes through `guardedEs`, fails or short-circuits, and is caught and
  logged as a warning ("ES index operation skipped") rather than surfaced
  to the caller or retried.

**Consequence:** any blog created, edited, or deleted while Elasticsearch is
down or the breaker is open will be missing or stale in search results
until the index is brought back in sync with the database. Non-search
reads of that same content (by slug, by user) are unaffected since they
read from Postgres directly.

**Recovery.** `syncBlogsToElasticsearch` (in
`backend/blog-service/src/utils/elasticsearch.ts`) rebuilds the `blogs`
index from Postgres in batches of 100, using a plain `bulk` call (not
routed through the breaker, since it is meant to run once Elasticsearch is
confirmed healthy again). An administrator can trigger this rebuild with
`POST /api/blogs/search/reindex` (admin authentication required). The
endpoint responds `202 Accepted` and runs the rebuild in the background —
there is no job queue behind it, just a single fire-and-forget pass, with
completion logged when it finishes. A second call while one is already
running returns `409` instead of starting a duplicate pass. If
Elasticsearch is unreachable at the time of the call, it returns `503` and
nothing starts. Run it once Elasticsearch is healthy again to close the
staleness window left by the outage.

## 7. Observability

blog-service's `/metrics` endpoint exposes:

- `mankahi_es_breaker_state` (gauge) — `0` CLOSED, `1` HALF_OPEN, `2` OPEN.
- `mankahi_es_breaker_transitions_total{to_state}` (counter) — incremented
  on every state transition, labeled with the state transitioned into.
- `mankahi_es_breaker_short_circuits_total` (counter) — incremented every
  time a call is rejected because the breaker was OPEN (or a HALF_OPEN probe
  was already in flight), without an Elasticsearch call being attempted.

The blog Grafana dashboard (`kubernetes/base/dashboards/blog-dashboard.json`)
has two panels for this: **"ES Circuit Breaker State"** (the state gauge
over time) and **"ES Breaker Short-circuits"** (short-circuit rate and
per-state transition counts).

The Prometheus rule `ESCircuitBreakerOpen`
(`kubernetes/base/monitoring-rules.yaml`) fires at `warning` severity when
`mankahi_es_breaker_state == 2` (OPEN) for 5 minutes continuously, and is
delivered through the same alert webhook channel as the rest of the
`mankahi` alert group (see `docs/operations.md` section 4).

## 8. Chaos drill 1 — local Compose

This drill exercises the breaker against the local Docker Compose stack
(`docker/compose/docker-compose.yml`). Container name: `mankahi-elasticsearch`.
Gateway: `http://localhost:8080` (nginx, per the Compose file's port mapping).

1. Confirm the stack is healthy and note the baseline breaker state:
   ```bash
   curl -s http://localhost:3002/metrics | grep mankahi_es_breaker_state
   # mankahi_es_breaker_state 0
   ```

2. Kill Elasticsearch:
   ```bash
   docker stop mankahi-elasticsearch
   ```

3. Drive search traffic with **varied query strings** — the search results
   cache means repeating the same query would be served from cache and
   would never reach Elasticsearch or the breaker at all:
   ```bash
   for i in $(seq 1 15); do
     curl -s -o /dev/null -w "%{http_code}\n" \
       "http://localhost:8080/api/blogs/search?query=chaos-drill-$i"
     sleep 1
   done
   ```
   Expected: every response is `200`, never a `5xx`. Inspecting a response
   body directly (drop `-o /dev/null -w ...`) shows the degraded shape:
   ```json
   {"blogs":[],"total":0,"page":1,"totalPages":0,"degraded":true,"reason":"search_unavailable"}
   ```

4. After roughly `ES_BREAKER_FAILURE_THRESHOLD` (default 5) failed calls,
   confirm the breaker tripped:
   ```bash
   curl -s http://localhost:3002/metrics | grep -E "mankahi_es_breaker_state|mankahi_es_breaker_short_circuits_total"
   # mankahi_es_breaker_state 2
   # mankahi_es_breaker_short_circuits_total 9
   ```
   The short-circuit counter should keep climbing on further varied-query
   requests while the breaker stays OPEN.

5. Confirm non-search paths are unaffected — reading and writing blogs still
   works (substitute a real slug/id and token as needed):
   ```bash
   curl -s http://localhost:8080/api/blogs/some-existing-slug
   # 200, full blog body, unaffected by the ES outage
   ```

6. Bring Elasticsearch back:
   ```bash
   docker start mankahi-elasticsearch
   ```

7. Keep sending varied-query traffic. Within one reset window
   (`ES_BREAKER_RESET_TIMEOUT_MS`, default 30s) of Elasticsearch being ready
   again, the next call after the window probes HALF_OPEN and, on success,
   closes the breaker:
   ```bash
   curl -s http://localhost:3002/metrics | grep mankahi_es_breaker_state
   # mankahi_es_breaker_state 0
   ```
   A brief transition through `1` (HALF_OPEN) during the probe itself is
   expected and may or may not be caught depending on scrape timing.

## 9. Chaos drill 2 — cluster

1. Delete the Elasticsearch pod:
   ```bash
   kubectl delete pod -l app=elasticsearch -n mankahi
   ```

2. The Elasticsearch Deployment uses `strategy: Recreate`
   (`kubernetes/environments/oci/patches/elasticsearch.yaml` and the base
   Deployment), so the old pod is fully torn down before a new one starts.
   Elasticsearch takes roughly 2 minutes to boot cold. This window is
   expected — not a failure to chase.

3. Watch the blog Grafana dashboard's "ES Circuit Breaker State" panel: it
   should show the breaker moving from `0` (Closed) to `2` (Open) once
   search traffic hits the deleted pod's absence, and back to `0` (Closed)
   once the new pod is ready and a probe succeeds.

4. If Elasticsearch is held down for more than 5 minutes, the
   `ESCircuitBreakerOpen` warning fires to the alert webhook (see section 7).

**Caution:** do not restart blog-service pods while Elasticsearch is down.
blog-service performs an unguarded Elasticsearch connectivity check at
startup (outside `guardedEs`, before the breaker is in the loop) — a pod
that boots while Elasticsearch is unavailable can crash-loop until
Elasticsearch returns, rather than starting up in a degraded-but-serving
state.

## 10. Documented follow-up

Redis — used by auth-service, blog-service (including the search cache
itself), and analytics-service — is not behind a circuit breaker of any
kind. A Redis outage today is handled ad hoc wherever it is used, not
through a common guarded path. This is a known gap and a candidate for the
same treatment described here, deliberately left out of this change to keep
the change small and reviewable.

# Future Enhancements & Production Considerations

## Potential Production Faults

### 1. Redis Single Point of Failure
- **Risk**: The current setup uses a single Redis instance. If Redis goes down, both the API (enqueue fails → 503) and the worker (can't consume jobs) halt entirely.
- **Mitigation**: Deploy Redis Sentinel or Redis Cluster for high availability. Add a circuit breaker in the API so 503s are returned fast without blocking on Redis timeouts.

### 2. MongoDB Connection Pool Exhaustion
- **Risk**: Under sustained high load, the MongoDB connection pool (`MONGO_MAX_POOL_SIZE=20`) may become saturated, causing write timeouts in the worker and health check failures.
- **Mitigation**: Tune `MONGO_MAX_POOL_SIZE` based on concurrency. Add connection pool monitoring. Consider read replicas for query-heavy operations.

### 3. Worker Starvation on Large Payloads
- **Risk**: If a single event processor takes very long (e.g., downstream API is slow), it blocks one of the `WORKER_CONCURRENCY` slots indefinitely until the drain timeout.
- **Mitigation**: Add a per-job processing timeout. Use BullMQ's `lockDuration` and `stalledInterval` settings to detect and requeue stalled jobs.

### 4. DLQ Growth Without Alerting
- **Risk**: Dead-letter events accumulate silently. Without monitoring, the `dead_letter_events` collection can grow unnoticed, hiding systemic upstream issues.
- **Mitigation**: Add a scheduled job or monitoring hook that alerts when `reviewStatus: 'pending'` count exceeds a threshold.

### 5. Signature Replay Window
- **Risk**: `SIGNATURE_TOLERANCE_SECONDS=300` (5 minutes) means a captured valid request can be replayed within that window. The idempotency key prevents duplicate processing, but the API still accepts and enqueues duplicates.
- **Mitigation**: Tighten tolerance to 30–60 seconds in production. Consider a nonce-based replay prevention cache in Redis.

### 6. No Rate Limiting
- **Risk**: The API has no rate limiting. A misbehaving client can flood the queue, saturating Redis and the worker.
- **Mitigation**: Add a rate limiter per source/IP using a Fastify plugin or reverse proxy (e.g., nginx, API gateway).

### 7. TTL-Based Cleanup Race Condition
- **Risk**: MongoDB TTL indexes run a background thread every 60 seconds. A record could be read by the worker just as it's being TTL-deleted.
- **Mitigation**: Set TTL durations significantly longer than any processing window. The current 30-day TTL for processed events is safe. Monitor for edge cases.

### 8. No Observability Stack
- **Risk**: Pino logs go to stdout. Without a log aggregation system (ELK, Datadog, etc.), debugging production issues requires manual container log inspection.
- **Mitigation**: Ship logs to a centralized platform. Add structured trace IDs to enable distributed tracing.

---

## Recommended Enhancements

### High Priority

| Enhancement | Description | Effort |
|---|---|---|
| **Redis HA** | Migrate from standalone Redis to Sentinel or Cluster | Medium |
| **Alerting on DLQ** | Scheduled check + webhook/email when pending DLQ exceeds threshold | Low |
| **Rate limiting** | Per-source request throttling via Fastify plugin or reverse proxy | Low |
| **Metrics endpoint** | Expose `/metrics` in Prometheus format (BullMQ stats, latency, queue depth) | Medium |
| **CI/CD pipeline** | GitHub Actions workflow: lint → type-check → test → build → Docker push | Medium |

### Medium Priority

| Enhancement | Description | Effort |
|---|---|---|
| **Distributed tracing** | OpenTelemetry integration with trace propagation across API → Queue → Worker | Medium |
| **Job priority** | BullMQ priority queues for critical event types | Low |
| **Webhook delivery** | Notify external systems on event processing completion or DLQ entry | Medium |
| **Schema versioning** | Version the event payload schema to support backward-compatible changes | Low |
| **Healthcheck HTTP on worker** | Expose a lightweight HTTP health endpoint on the worker (currently log-only) | Low |

### Lower Priority

| Enhancement | Description | Effort |
|---|---|---|
| **Multi-tenant support** | Partition queues and signing secrets per courier partner | High |
| **Event sourcing** | Store full event history for audit/replay instead of upsert-only shipment states | High |
| **Admin dashboard** | BullMQ Board or custom UI for queue monitoring and DLQ management | Medium |
| **Canary deployments** | Blue/green or canary strategy for zero-downtime deploys | Medium |
| **Load test automation** | Integrate load test into CI with baseline regression detection | Medium |

---

## Security Hardening Checklist

- [ ] Tighten `SIGNATURE_TOLERANCE_SECONDS` to 30–60s in production
- [ ] Rotate `SIGNING_SECRET` periodically with key versioning support
- [ ] Enable TLS for Redis connections (`rediss://`)
- [ ] Enable MongoDB authentication and TLS
- [ ] Add request body size limits to Fastify (`bodyLimit`)
- [ ] Run Docker containers as non-root (already in Dockerfile, verify in production)
- [ ] Apply network segmentation — Redis/Mongo should not be publicly accessible
- [ ] Add Content Security Policy and security headers to API responses

---

## Scaling Guidelines

| Component | Current | Scaling Path |
|---|---|---|
| gateway-api | Single instance | Horizontal scale behind load balancer (stateless) |
| gateway-worker | Single instance, 10 concurrency | Horizontal scale (multiple workers consume same queue). Increase `WORKER_CONCURRENCY` per instance. |
| Redis | Single instance | Redis Cluster for >100k ops/sec |
| MongoDB | Single instance | Replica set for HA, sharding for >10M documents |

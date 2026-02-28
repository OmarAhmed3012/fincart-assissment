# Implementation Plan: Resilient Event Orchestration Gateway

**Branch**: `001-build-event-orchestration-gateway` | **Date**: 2026-02-26 | **Spec**: `C:\Users\omara\Desktop\fincart\specs\001-build-event-orchestration-gateway\spec.md`
**Input**: Feature specification from `C:\Users\omara\Desktop\fincart\specs\001-build-event-orchestration-gateway\spec.md`

## Summary

Deliver a two-service event gateway that accepts signed courier events, acknowledges quickly, then handles processing asynchronously through Redis-backed queues with MongoDB-backed idempotency and dead-letter persistence. The plan enforces strict service boundaries: `gateway-api` performs only validation, acknowledgement, and enqueueing, while `gateway-worker` performs only background processing, retries, and DLQ handling. Supporting artifacts include Docker Compose runtime, load-test strategy for 100 concurrent requests, and operational documentation.

## Technical Context

**Language/Version**: Node.js 20 LTS  
**Primary Dependencies**: Fastify (HTTP API), fastify-raw-body (raw body capture for HMAC), BullMQ (queue processing), ioredis (Redis client), MongoDB Node driver/Mongoose (document persistence), Pino (structured logging — constitutional mandate §10), Zod (payload validation)  
**Storage**: Redis (queue transport), MongoDB (idempotency, active shipment context, dead-letter records)  
**Testing**: Vitest/Jest (unit and integration), k6 or Artillery (load testing), Supertest (HTTP contract verification)  
**Target Platform**: Linux containers via Docker Compose (local and CI parity)  
**Project Type**: Two backend services with shared internal package  
**Performance Goals**: p95 ingestion response time ≤ 150ms under normal load (Constitution §3 hard target); ≥ 99% of valid submissions acknowledged within 2 seconds under 100 concurrent requests (load-test tolerance, SC-001); all acknowledged events reach terminal state (processed or dead-letter)  
**Constraints**: Two independent deployable services, communication only through Redis queue, at-least-once delivery semantics with idempotent outcomes, no synchronous business processing on API request path, Fastify mandated (Constitution §4/§14), Pino mandated (Constitution §10)  
**Scale/Scope**: 100 concurrent intake requests baseline; one queue domain with main + DLQ; single courier event contract version for initial release

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Active Constitution**: `.specify/constitution.md` — Version 1.0, status ACTIVE, 15 binding sections.

Gate evaluation (post-design):
- Gate 1 — §1 Architectural Philosophy: **PASS**. Two-service separation enforces ingestion/processing decoupling.
- Gate 2 — §2 Non-Negotiable Principles: **PASS**. No heavy processing in HTTP handler; HMAC required; queue-before-ack; idempotency in worker; structured JSON logging.
- Gate 3 — §3 Thin Ingestion / Latency: **PASS**. API handler limited to validate → enqueue → ack. p95 ≤ 150ms target documented.
- Gate 4 — §4 HMAC Raw-Body Validation: **PASS**. Fastify raw-body capture, timing-safe compare, per-provider secrets.
- Gate 5 — §5 BullMQ Queue Architecture: **PASS**. Dedicated main + DLQ queues, job data contract includes all mandated fields.
- Gate 6 — §6 Concurrency Control: **PASS**. Worker concurrency configurable via env var, bounded connection pools.
- Gate 7 — §7 Idempotency: **PASS**. Check-before-process in worker only, atomic record-on-complete, TTL on records.
- Gate 8 — §8 Retry/Backoff: **PASS**. 5 attempts, exponential backoff with 1000ms base, jitter applied.
- Gate 9 — §9 DLQ: **PASS**. Dedicated DLQ queue + MongoDB persistence, attempt history retained.
- Gate 10 — §10 Observability: **PASS**. Pino mandated, correlation IDs, structured JSON, `/health` endpoint.
- Gate 11 — §11 Graceful Shutdown: **PASS**. Signal handling, HTTP drain, worker drain, connection cleanup.
- Gate 12 — §12 Docker/Env: **PASS**. Multi-stage builds, non-root, health checks, env validation at startup.
- Gate 13 — §14 Clean Architecture: **PASS**. Layer separation, dependency rules, strict TypeScript.

No constitutional violations remain.

## Phase 0: Research Outcomes

- Completed in `C:\Users\omara\Desktop\fincart\specs\001-build-event-orchestration-gateway\research.md`.
- All technical unknowns from the template were resolved; no `NEEDS CLARIFICATION` markers remain.

## Phase 1: Design Outcomes

### Service Responsibilities

**gateway-api (does):**
- Verify request signature and payload schema.
- Reject invalid or unauthorized events with explicit failure response.
- Persist/record intake metadata needed before enqueue.
- Enqueue accepted events into the main queue.
- Return immediate acknowledgement without waiting for business processing.

**gateway-api (does NOT):**
- Execute business workflow side effects.
- Perform retry orchestration.
- Move jobs to DLQ.
- Resolve active shipment state transitions.

**gateway-worker (does):**
- Consume main queue jobs.
- Load and update idempotency state.
- Resolve active shipment/order context.
- Classify errors (transient vs permanent).
- Apply retry policy (attempt count, exponential backoff, jitter).
- Persist exhausted failures and route to DLQ.

**gateway-worker (does NOT):**
- Expose public event ingestion endpoints.
- Acknowledge inbound courier requests.
- Accept direct processing commands that bypass queue transport.

### Queue Topology

- **Main queue**: `courier-events-main` for accepted event processing.
- **DLQ queue**: `courier-events-dlq` for exhausted or permanently failed jobs.
- **Job payload contract**: `eventId`, `eventType`, `occurredAt`, `source`, `signatureMeta`, `idempotencyKey`, `traceId`, `attempt`, `payload`, `receivedAt`.
- **Queue transport rule**: API publishes to main queue; worker consumes main queue and publishes terminal failures to DLQ queue.

### Mongo Collections and Data Strategy

- **processed_events**: idempotency and processing ledger.
  - Unique index: `(idempotencyKey)`.
  - Supporting index: `(status, updatedAt)`.
  - TTL index: optional on terminal records via `expiresAt` (default 30 days).
- **active_shipments**: current shipment/order context.
  - Unique index: `(shipmentId)`.
  - Supporting index: `(orderId)`, `(status, updatedAt)`.
  - TTL: none for active records; archival policy handled operationally.
- **dead_letter_events**: terminal failure archive.
  - Unique index: `(eventId, terminalReasonCode)`.
  - Supporting index: `(createdAt)`, `(reviewStatus, createdAt)`.
  - TTL index: `expiresAt` (default 90 days).

### Retry Policy

- **Attempts**: default maximum 5 total attempts (initial + 4 retries).
- **Backoff**: exponential schedule with base delay 1 second and multiplier 2 (`1s, 2s, 4s, 8s`). Initial delay aligns with Constitution §8 recommended default of 1000ms.
- **Jitter**: random 0-20% additional delay to reduce synchronized retries.
- **Transient errors**: network timeout, temporary Redis/Mongo unavailability, dependency throttling, and explicit retryable downstream responses.
- **Permanent errors**: schema-invalid business payload, missing mandatory domain keys, signature mismatch discovered in worker validation replay, and non-retryable downstream business rejection.

### Concurrency and Connection Strategy

- **Worker concurrency**: configurable parallel job handling, default `WORKER_CONCURRENCY=10`.
- **Redis connections**: separate producer and consumer clients per service with bounded reconnect policy.
- **Mongo connections**: pooled connections with configurable min/max pool size for API and worker.
- **Environment-based configuration**: concurrency, retry limits, backoff, and pool sizing controlled by env vars only (no hardcoded operational values).

### Graceful Shutdown

- **gateway-api**:
  - Stop accepting new requests.
  - Drain in-flight requests up to shutdown timeout.
  - Flush pending enqueue operations.
  - Close Redis and Mongo clients cleanly.
- **gateway-worker**:
  - Pause queue consumption.
  - Allow active jobs to finish within drain timeout.
  - Requeue unfinished jobs that exceed drain timeout.
  - Flush terminal status updates and close Redis/Mongo clients.

### Docker Compose Design

- Services: `gateway-api`, `gateway-worker`, `redis`, `mongo`.
- Health checks:
  - `redis`: ping-based readiness.
  - `mongo`: database ping/readiness command.
  - `gateway-api`: HTTP health endpoint.
  - `gateway-worker`: process heartbeat health endpoint/log marker.
- Dependency ordering:
  - `gateway-api` and `gateway-worker` depend on healthy `redis` and `mongo`.
  - Worker start order after queue transport and storage are healthy.

### Environment Variables (Planned)

- Service identity: `SERVICE_NAME`, `NODE_ENV`, `LOG_LEVEL`.
- API runtime: `API_PORT`, `ACK_TIMEOUT_MS`, `SIGNING_SECRET`, `SIGNATURE_TOLERANCE_SECONDS`.
- Queue config: `REDIS_URL`, `QUEUE_MAIN_NAME`, `QUEUE_DLQ_NAME`, `QUEUE_PREFIX`.
- Worker runtime: `WORKER_CONCURRENCY`, `WORKER_DRAIN_TIMEOUT_MS`.
- Retry config: `RETRY_MAX_ATTEMPTS`, `RETRY_BACKOFF_BASE_MS`, `RETRY_BACKOFF_MULTIPLIER`, `RETRY_JITTER_PERCENT`.
- Mongo config: `MONGO_URI`, `MONGO_DB_NAME`, `MONGO_MIN_POOL_SIZE`, `MONGO_MAX_POOL_SIZE`.
- Data retention: `PROCESSED_EVENTS_TTL_DAYS`, `DLQ_TTL_DAYS`.
- Load test support: `LOADTEST_TARGET_URL`, `LOADTEST_CONCURRENCY`, `LOADTEST_TOTAL_REQUESTS`.

### Load Test Strategy

- Use a script-driven approach from `scripts/load-test/` that generates signed requests and executes 100 concurrent submissions.
- Include a duplicate-injection mode that resubmits a controlled percentage of identical `idempotencyKey` values.
- Capture metrics: acknowledgement latency distribution, success/error rates, enqueue success rate, terminal processing ratio, retry counts, DLQ count, and duplicate suppression rate.
- Store test output artifacts in timestamped result files for reproducibility and baseline comparisons.

## Project Structure

### Documentation (this feature)

```text
specs/001-build-event-orchestration-gateway/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ingestion-api.md
│   └── queue-job-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
gateway-api/
├── src/
│   ├── config/          # Environment parsing & validation
│   ├── controllers/     # Thin HTTP route handlers (Constitution §14)
│   ├── services/        # Queue producer, HMAC validation orchestration
│   ├── middleware/       # HMAC signature guard, error handler
│   ├── validators/      # Zod payload schemas
│   └── health/          # /health endpoint
├── server.ts            # Fastify server bootstrap
├── main.ts              # Entry point
└── tests/
    ├── unit/
    ├── integration/
    └── contract/

gateway-worker/
├── src/
│   ├── config/
│   ├── queue/
│   ├── processors/
│   ├── repositories/
│   └── health/
└── tests/
    ├── unit/
    ├── integration/
    └── contract/

packages/
└── shared/
    ├── src/
    │   ├── contracts/
    │   ├── validation/
    │   ├── crypto/
    │   └── logging/
    └── tests/

scripts/
├── load-test/
└── signing/

docker-compose.yml
```

**Structure Decision**: Monorepo with two independently runnable services and one shared package. Queue-only inter-service communication and shared contracts in `packages/shared` are required to maintain consistency while preserving service autonomy.

## Complexity Tracking

All constitutional compliance violations from initial plan generation have been corrected (see Constitution Check section above). Framework alignment changed from Express to Fastify per Constitution §4/§14. Backoff base delay corrected from 2s to 1s per Constitution §8. p95 ≤ 150ms hard target added per Constitution §3.

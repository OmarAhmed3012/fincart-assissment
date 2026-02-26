# CONSTITUTION — Resilient Event Orchestration Gateway

> **Classification:** Spec Kit — Foundational Architecture Contract  
> **Version:** 1.0  
> **Status:** ACTIVE — All implementation work MUST comply  
> **Scope:** End-to-end event ingestion, queuing, processing, persistence, and observability

---

## Preamble

This Constitution is the supreme architectural law governing the Resilient Event Orchestration Gateway. Every design decision, code module, library choice, configuration, and operational procedure MUST conform to the principles and constraints defined herein. No implementation shall override, circumvent, or weaken these rules without formal amendment to this document.

The system exists to **reliably ingest, queue, and process high-volume tracking events** originating from volatile external courier systems, under conditions including flash-sale traffic bursts, carrier outages, and unpredictable load patterns. Correctness, resilience, and latency discipline are paramount.

---

## §1 — Core Architectural Philosophy

1. **Ingestion and processing are separate concerns.** The HTTP layer exists solely to receive, validate, and enqueue. Processing happens asynchronously.
2. **Speed at the edge, safety at the core.** Acknowledgement must be fast; processing must be correct.
3. **Assume failure.** Every external dependency — Redis, MongoDB, courier APIs — will fail. The architecture must tolerate, retry, and degrade gracefully.
4. **Idempotency is not optional.** Every event must be safe to process more than once. Duplicate delivery is a baseline assumption.
5. **Observability is a first-class citizen.** If it cannot be measured, traced, and alerted on, it does not exist.
6. **Modularity over convenience.** The system must be composed of discrete, testable, replaceable modules with explicit boundaries.

---

## §2 — Non-Negotiable Technical Principles

The following principles are **absolute and non-negotiable**. Violations constitute architectural defects.

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | **No synchronous heavy processing in the HTTP handler.** | Protects ingestion latency and event-loop health. |
| 2 | **All events must pass HMAC signature verification before acceptance.** | Prevents ingestion of forged or tampered payloads. |
| 3 | **All accepted events must be enqueued to a Redis-backed queue before acknowledgement.** | Decouples ingestion from processing; guarantees durability. |
| 4 | **Every event must be idempotency-checked before processing.** | Prevents duplicate side-effects under re-delivery. |
| 5 | **Failed events must be retried with exponential backoff before dead-lettering.** | Maximizes successful processing without overwhelming downstream systems. |
| 6 | **The event loop must never be blocked.** | A blocked event loop is a system-wide failure. |
| 7 | **Structured JSON logging only.** | Enables machine-parseable observability pipelines. |
| 8 | **Graceful shutdown must be implemented.** | In-flight work must complete or be re-queued; connections must be drained cleanly. |

---

## §3 — Thin Ingestion Layer Design

The HTTP ingestion layer is a **thin, fast, stateless gateway**. It MUST NOT contain business logic, transformation logic, enrichment logic, or database writes beyond idempotency checks.

### Allowed Operations in the Ingestion Handler

- Parse and buffer the raw request body.
- Validate the HMAC signature against the raw body.
- Perform basic structural validation (required fields, payload shape).
- Enqueue the validated event payload to the BullMQ queue.
- Return an HTTP acknowledgement response.

### Prohibited Operations in the Ingestion Handler

- **NO** database reads or writes for business logic purposes.
- **NO** calls to external APIs or third-party services.
- **NO** event enrichment, transformation, or mapping.
- **NO** complex conditional branching based on event content.
- **NO** synchronous operations exceeding 10ms of estimated CPU time.

### Latency Target

- **p95 response time ≤ 150ms.** This is a hard target. If ingestion latency exceeds this threshold under normal load, the implementation is non-conforming.

---

## §4 — HMAC Signature Validation

All inbound webhook events MUST be authenticated via HMAC signature verification. This is a **mandatory security gate** — no event shall be enqueued without passing it.

### Requirements

1. **Raw body preservation.** The raw request body MUST be captured before any parsing, deserialization, or middleware transformation. Fastify's `rawBody` or equivalent content-type parser configuration MUST be used.
2. **Signature computation.** The HMAC digest MUST be computed over the **exact raw bytes** received. Computing the signature over a re-serialized JSON object is **forbidden** — byte-level fidelity is required.
3. **Timing-safe comparison.** Signature comparison MUST use a constant-time comparison function (e.g., `crypto.timingSafeEqual`). String equality operators (`===`, `==`) are **forbidden** for signature comparison.
4. **Algorithm and secret management.** The HMAC algorithm (e.g., SHA-256) and secret key MUST be configurable per courier/provider via environment variables or a secure secret store. Hardcoded secrets are **forbidden**.
5. **Rejection behavior.** Requests failing signature validation MUST receive an HTTP `401 Unauthorized` response. The response body MUST NOT leak internal details. The failure MUST be logged with sufficient context for debugging (request ID, courier identifier, timestamp).

---

## §5 — Asynchronous Processing via Redis Queues

All event processing beyond ingestion MUST occur asynchronously through a Redis-backed queue system. **BullMQ** is the mandated queue library.

### Queue Architecture

1. **Dedicated queues per event domain.** If the system handles events from multiple courier providers or event types, each logical domain SHOULD have its own queue to enable independent scaling, monitoring, and failure isolation.
2. **Job data contract.** Every enqueued job MUST carry:
   - A unique job ID (preferably derived from the event's natural identifier for idempotency).
   - The full raw event payload.
   - Metadata: source identifier, receipt timestamp (ISO 8601), ingestion request ID.
3. **Redis connection resilience.** The queue producer and consumer MUST handle Redis connection failures gracefully — reconnecting automatically without crashing the process.

### Worker Design

1. Workers MUST be stateless. No in-memory state shall persist between job executions.
2. Workers MUST implement their own error boundaries. An unhandled exception in one job MUST NOT affect other jobs or crash the worker process.
3. Workers MUST respect concurrency limits (see §6).

---

## §6 — Concurrency Control Strategy

Unbounded concurrency is **prohibited**. Every concurrent operation MUST be explicitly bounded.

### Rules

1. **BullMQ worker concurrency MUST be configurable.** The concurrency factor MUST be set via environment variable, with a sensible default (recommended: 5–20 depending on workload profile).
2. **No unbounded `Promise.all` over dynamic-length arrays.** If batch-processing is required, use a concurrency-limited utility (e.g., `p-limit`, BullMQ's built-in concurrency, or explicit semaphore patterns).
3. **Connection pool limits.** MongoDB and Redis connections MUST use bounded connection pools. Pool sizes MUST be configurable via environment variables.
4. **Rate limiting on downstream calls.** If workers call external APIs, those calls MUST be rate-limited to prevent cascading failures under burst load.

---

## §7 — Idempotency Enforcement Strategy

Every event MUST be safe to process multiple times with identical outcomes. Idempotency is **structurally enforced**, not assumed.

### Requirements

1. **Idempotency key derivation.** Each event MUST have a deterministic idempotency key derived from its natural identifiers (e.g., courier ID + tracking number + event type + timestamp hash). The derivation logic MUST be pure and deterministic.
2. **Check-before-process.** Before executing any side-effecting operation, the worker MUST query the idempotency store (MongoDB) to determine if the event has already been processed.
3. **Atomic record-on-complete.** Upon successful processing, the idempotency record MUST be written atomically. If using MongoDB, this SHOULD leverage `findOneAndUpdate` with `upsert: true` or equivalent atomic operations.
4. **TTL on idempotency records.** Idempotency records MUST have a configurable TTL (recommended: 7–30 days) implemented via MongoDB TTL indexes. Records MUST NOT accumulate indefinitely.
5. **Failure does NOT record idempotency.** If processing fails, the idempotency record MUST NOT be written. The event must remain eligible for retry.

---

## §8 — Retry Strategy and Exponential Backoff

Failed jobs MUST be retried. Retries MUST follow a disciplined backoff strategy to avoid thundering-herd effects and downstream overload.

### Requirements

1. **Configurable retry count.** The maximum number of retry attempts MUST be configurable via environment variable. Recommended default: **5 attempts**.
2. **Exponential backoff with jitter.** Retry delays MUST follow an exponential backoff curve with randomized jitter. BullMQ's built-in `backoff: { type: 'exponential' }` configuration is acceptable, provided jitter is applied.
3. **Backoff parameters.** The initial delay and backoff multiplier MUST be configurable. Recommended defaults:
   - Initial delay: **1000ms**
   - Multiplier factor managed by BullMQ's exponential type
4. **Distinguishing transient vs. permanent failures.** Workers SHOULD classify errors:
   - **Transient** (network timeout, 5xx from downstream): eligible for retry.
   - **Permanent** (malformed payload, business rule violation, 4xx): skip retries, move directly to DLQ.
5. **Attempt metadata.** Each retry attempt number and the associated error MUST be logged for observability.

---

## §9 — Dead Letter Queue (DLQ)

Events that exhaust all retry attempts MUST be routed to a Dead Letter Queue. Silently dropping failed events is **absolutely forbidden**.

### Requirements

1. **Dedicated DLQ per source queue.** Each primary queue MUST have a corresponding DLQ. DLQ naming convention: `{queueName}:dlq`.
2. **DLQ job data.** Dead-lettered jobs MUST retain:
   - The original event payload.
   - All error messages and stack traces from each failed attempt.
   - The total attempt count.
   - Timestamps: original receipt, each attempt, final failure.
3. **DLQ persistence.** Dead-lettered events MUST also be persisted to MongoDB in a dedicated `dead_letter_events` collection for durability beyond Redis eviction.
4. **DLQ alerting.** The system MUST emit metrics or log events when a job enters the DLQ. These MUST be wired to alerting infrastructure.
5. **DLQ reprocessing.** The architecture MUST support manual or automated reprocessing of DLQ events. A mechanism (CLI command, admin endpoint, or script) MUST be documented and deliverable.

---

## §10 — Observability and Logging Standards

Observability is a **structural requirement**, not an afterthought. The system MUST be instrumentable, debuggable, and monitorable in production.

### Logging

1. **Logger: Pino.** Pino is the mandated structured logging library. No other logging library shall be used in production code.
2. **Format: JSON only.** All log output MUST be structured JSON. Human-readable pretty-printing is permitted ONLY in local development mode.
3. **Correlation IDs.** Every log entry associated with a request or job MUST include a correlation/request ID that traces the event from ingestion through processing to completion or failure.
4. **Log levels.** Use log levels consistently:
   - `fatal`: Process is about to crash.
   - `error`: Operation failed, requires attention.
   - `warn`: Unexpected condition, but recoverable.
   - `info`: Significant lifecycle events (startup, shutdown, job completed).
   - `debug`: Detailed diagnostic information (disabled in production by default).
   - `trace`: Ultra-verbose (never enabled in production).
5. **Sensitive data.** Logs MUST NOT contain secrets, tokens, full customer PII, or raw HMAC keys. Payload logging MUST redact sensitive fields.

### Metrics

1. The system SHOULD expose key operational metrics:
   - Ingestion rate (events/sec).
   - Queue depth per queue.
   - Job processing duration (p50, p95, p99).
   - Retry count distribution.
   - DLQ entry rate.
   - Error rate by category.
2. Metrics SHOULD be exportable via Prometheus-compatible endpoints or structured log aggregation.

### Health Checks

1. The system MUST expose a `/health` endpoint returning the health status of:
   - The HTTP server.
   - Redis connectivity.
   - MongoDB connectivity.
2. Health checks MUST be lightweight and MUST NOT impose load on downstream systems.

---

## §11 — Graceful Shutdown

The system MUST shut down cleanly when receiving termination signals (`SIGTERM`, `SIGINT`). Abrupt termination causing data loss or orphaned jobs is **unacceptable**.

### Requirements

1. **Signal handling.** The process MUST listen for `SIGTERM` and `SIGINT` and initiate an orderly shutdown sequence.
2. **HTTP server drain.** Upon receiving a shutdown signal, the HTTP server MUST:
   - Stop accepting new connections.
   - Allow in-flight requests to complete (with a configurable timeout, recommended: 10–30 seconds).
   - Then close the listener.
3. **Queue worker drain.** BullMQ workers MUST:
   - Stop picking up new jobs.
   - Allow currently active jobs to complete (within a configurable timeout).
   - If a job cannot complete within the timeout, it MUST be returned to the queue for re-processing.
4. **Connection cleanup.** All Redis and MongoDB connections MUST be closed after workers and the HTTP server have drained.
5. **Shutdown logging.** The shutdown sequence MUST be logged at each phase: signal received → stop accepting → draining → connections closed → process exit.

---

## §12 — Docker and Environment Configuration

The system MUST be containerized and environment-driven. No configuration shall be hardcoded.

### Docker

1. **Multi-stage builds.** The Dockerfile MUST use multi-stage builds to minimize the production image size.
2. **Non-root execution.** The container MUST run as a non-root user.
3. **Health check instruction.** The Dockerfile MUST include a `HEALTHCHECK` instruction.
4. **`.dockerignore`** MUST exclude `node_modules`, `.git`, test files, and local configuration from the build context.

### Docker Compose

1. A `docker-compose.yml` MUST be provided for local development and testing.
2. It MUST include services for: the application, Redis, and MongoDB.
3. Services MUST define health checks and dependency ordering (`depends_on` with `condition: service_healthy`).

### Environment Configuration

1. **All runtime configuration MUST be sourced from environment variables.** This includes:
   - Port numbers.
   - Redis and MongoDB connection strings.
   - HMAC secrets and algorithms.
   - Queue names and concurrency settings.
   - Retry counts, backoff parameters, and TTLs.
   - Log levels.
2. **A `.env.example` file MUST be provided** documenting every environment variable, its purpose, type, and default value.
3. **Environment validation at startup.** The application MUST validate all required environment variables at process start. Missing or malformed variables MUST cause an immediate, descriptive failure — not a silent runtime error.

---

## §13 — Documentation and Deliverable Expectations

Documentation is a **deliverable**, not an afterthought. Undocumented systems are incomplete systems.

### Required Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview, quickstart, architecture summary, and developer onboarding. |
| `CONSTITUTION.md` | This document. The supreme architectural contract. |
| `.env.example` | Complete environment variable reference. |
| `docs/architecture.md` | Detailed architecture diagram and data flow documentation. |
| `docs/api.md` | HTTP endpoint contracts (request/response schemas, status codes, headers). |
| `docs/queues.md` | Queue topology, job schemas, retry policies, and DLQ procedures. |
| `docs/runbook.md` | Operational runbook: deployment, scaling, monitoring, incident response, DLQ reprocessing. |

### Deliverable Expectations

1. The system MUST be runnable locally with a single `docker-compose up` command after copying `.env.example` to `.env`.
2. All modules MUST have unit tests. Integration tests covering the ingestion-to-processing pipeline MUST exist.
3. A CI pipeline configuration (GitHub Actions or equivalent) SHOULD be provided.

---

## §14 — Clean Architecture and Modular Monolith Separation

The codebase MUST follow Clean Architecture principles organized as a Modular Monolith. Spaghetti code, god modules, and circular dependencies are **structural violations**.

### Layer Separation

```
src/
├── modules/                    # Feature modules (bounded contexts)
│   └── tracking/               # Example: tracking event module
│       ├── controllers/        # HTTP route handlers (thin)
│       ├── queues/             # Queue producers and consumers
│       ├── services/           # Business logic and orchestration
│       ├── repositories/       # Data access (MongoDB)
│       ├── validators/         # Input validation schemas
│       └── types/              # TypeScript interfaces and types
├── shared/                     # Cross-cutting concerns
│   ├── infrastructure/         # Redis, MongoDB, Logger setup
│   ├── middleware/             # HMAC validation, error handling
│   ├── config/                # Environment parsing & validation
│   └── utils/                 # Pure utility functions
├── server.ts                  # Fastify server bootstrap
└── main.ts                    # Entry point
```

### Dependency Rules

1. **Controllers** depend on **Services**. Never on Repositories directly.
2. **Services** depend on **Repositories** and other Services. Never on Controllers or HTTP primitives.
3. **Repositories** depend on the database driver only. Never on Services or Controllers.
4. **Shared infrastructure** is consumed by modules, never the reverse.
5. **No circular dependencies.** Module A MUST NOT import from Module B if Module B imports from Module A. Enforce with tooling (e.g., `eslint-plugin-import`, `madge`).

### TypeScript Standards

1. **Strict mode.** `tsconfig.json` MUST enable `"strict": true`.
2. **No `any`.** The use of `any` type is **forbidden** in production code. Use `unknown` and narrow explicitly.
3. **Explicit return types.** All exported functions and methods MUST declare explicit return types.
4. **Interface-driven contracts.** Module boundaries MUST be defined by TypeScript interfaces, not concrete implementations.

---

## §15 — Enforcement and Compliance

This Constitution is **not advisory**. It is **binding**.

1. **Code review gates.** Every pull request MUST be evaluated against this Constitution. Non-conforming code MUST NOT be merged.
2. **Automated enforcement.** Where possible, rules MUST be enforced via linters, type-checking (`tsc --noEmit`), and CI pipeline checks.
3. **Amendment process.** This Constitution may be amended only through explicit, documented, and justified changes. Amendments MUST be versioned and appended to a changelog at the bottom of this document.
4. **Violation escalation.** Any discovered violation in merged code MUST be treated as a high-priority defect and remediated immediately.

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | 2026-02-26 | Initial Constitution ratified. |

---

*This document is the architectural contract for the Resilient Event Orchestration Gateway. It exists to protect the system's integrity under pressure, at scale, and across time. Build accordingly.*

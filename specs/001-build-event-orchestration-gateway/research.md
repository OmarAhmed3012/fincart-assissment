# Phase 0 Research: Resilient Event Orchestration Gateway

## Decision 1: Runtime and service model
- **Decision**: Use a two-service Node.js runtime (`gateway-api`, `gateway-worker`) in one repository with independent process lifecycles.
- **Rationale**: Aligns with locked architecture, enables horizontal scaling per service role, and keeps ingestion latency isolated from background workloads.
- **Alternatives considered**:
  - Single-process combined API and worker: rejected due to coupling and contention risk.
  - More than two services: rejected as out of scope for current requirements.

## Decision 2: HTTP framework
- **Decision**: Use **Fastify** as the HTTP framework for `gateway-api`. Constitutional mandate (§4, §14).
- **Rationale**: Fastify provides native raw-body support via `fastify-raw-body` for HMAC verification (Constitution §4), superior throughput under high concurrency, built-in Pino integration, and schema-based validation. Its low-overhead request pipeline directly supports the p95 ≤ 150ms latency target (Constitution §3).
- **Alternatives considered**:
  - Express: rejected — no native raw-body support (requires extra middleware), slower request throughput, higher latency overhead under burst load.
  - NestJS (Express adapter): rejected — adds framework abstraction overhead without performance benefit; Express raw-body limitations persist.
  - NestJS (Fastify adapter): rejected — adds unnecessary abstraction complexity for a two-service system; increases implementation risk and debugging surface area for marginal structural benefit.

## Decision 3: Structured logging
- **Decision**: Use **Pino** as the sole structured logging library. Constitutional mandate (§10).
- **Rationale**: Pino produces JSON-structured logs natively, integrates with Fastify out of the box, supports correlation IDs via child loggers, and imposes minimal serialization overhead — critical for maintaining event-loop health under burst traffic.
- **Alternatives considered**:
  - Winston: rejected — higher serialization overhead, no native Fastify integration.
  - Console.log: rejected — not structured, not production-grade, violates Constitution §2 principle 7.

## Decision 4: Queue transport and topology
- **Decision**: Use BullMQ with Redis for queue transport, with `courier-events-main` and `courier-events-dlq` queues.
- **Rationale**: BullMQ provides durable job orchestration, retry metadata, and operational primitives suited for asynchronous event pipelines.
- **Alternatives considered**:
  - Redis lists/streams without queue framework: rejected due to higher custom operational burden.
  - Message broker replacement (Kafka/RabbitMQ): rejected because architecture is locked to Redis-backed BullMQ.

## Decision 5: Idempotency and persistence model
- **Decision**: Use MongoDB collections `processed_events`, `active_shipments`, and `dead_letter_events` with explicit indexing and TTL strategies.
- **Rationale**: Supports idempotency lookup, domain state context, and DLQ persistence with flexible document schema and operationally simple indexing.
- **Alternatives considered**:
  - Single collection for all states: rejected due to mixed query patterns and lifecycle requirements.
  - SQL persistence: rejected because architecture is locked to MongoDB.

## Decision 6: Retry and error classification
- **Decision**: Use max 5 attempts with exponential backoff (1000ms base delay, multiplier 2), 0-20% jitter, and deterministic transient/permanent error classification. Base delay aligns with Constitution §8 recommended default.
- **Rationale**: Balances recovery probability with bounded processing time and avoids retry storms under partial outages.
- **Alternatives considered**:
  - Linear retry: rejected due to lower resilience under sustained transient faults.
  - Infinite retry: rejected because it blocks terminal handling and DLQ visibility.

## Decision 5: Concurrency and resource control
- **Decision**: Worker concurrency and Redis/Mongo pool sizes are environment-driven with safe defaults and explicit upper bounds.
- **Rationale**: Allows tuning by environment while preventing resource exhaustion from static hardcoded assumptions.
- **Alternatives considered**:
  - Hardcoded concurrency and pool values: rejected for poor operability.
  - Fully dynamic autoscaling logic in v1: rejected as unnecessary complexity for initial scope.

## Decision 6: Graceful shutdown behavior
- **Decision**: API stops intake and drains requests; worker pauses consumption, drains active jobs, and safely requeues incomplete work before exit.
- **Rationale**: Prevents event loss and inconsistent terminal states during restarts and deployments.
- **Alternatives considered**:
  - Immediate process termination: rejected due to data loss risk.
  - Long unbounded draining: rejected due to deployment unpredictability.

## Decision 7: Local runtime and health model
- **Decision**: Docker Compose includes `gateway-api`, `gateway-worker`, `redis`, and `mongo` with readiness health checks and dependency ordering.
- **Rationale**: Ensures reproducible startup and deterministic test execution across team environments.
- **Alternatives considered**:
  - Manual local startup: rejected due to setup inconsistency.
  - Single-container packaging: rejected because it hides inter-service behavior.

## Decision 8: Load test methodology
- **Decision**: Scripted load test executes 100 concurrent signed submissions, including controlled duplicate injection, with persisted result artifacts.
- **Rationale**: Directly validates spec success criteria for acknowledgement performance, idempotency, and terminal delivery outcomes.
- **Alternatives considered**:
  - Synthetic unit-only performance checks: rejected as insufficient for queue + persistence behavior.
  - No duplicate injection: rejected because idempotency is a core requirement.

## Clarification Status

All planning unknowns are resolved. No `NEEDS CLARIFICATION` items remain.

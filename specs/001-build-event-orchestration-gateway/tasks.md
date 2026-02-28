# Tasks: Resilient Event Orchestration Gateway

**Input**: Design documents from `C:\Users\omara\Desktop\fincart\specs\001-build-event-orchestration-gateway\`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Included because the specification explicitly requires load-test proof for 100 concurrent requests and independently testable user stories.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize monorepo layout, tooling, and local runtime skeleton.

- [ ] T001 Create monorepo directory skeleton in `gateway-api/`, `gateway-worker/`, `packages/shared/`, `scripts/load-test/`, and `scripts/signing/`
- [ ] T002 Initialize workspace package configuration in `package.json`
- [ ] T003 [P] Add root TypeScript configuration and project references in `tsconfig.json`
- [ ] T004 [P] Add root lint/format configuration in `.eslintrc.cjs` and `.prettierrc`
- [ ] T005 [P] Add base environment template in `.env.example`
- [ ] T006 [P] Initialize gateway API package manifest in `gateway-api/package.json`
- [ ] T007 [P] Initialize gateway worker package manifest in `gateway-worker/package.json`
- [ ] T008 [P] Initialize shared package manifest in `packages/shared/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before any user story can be delivered.

**CRITICAL**: No user story implementation starts until this phase completes.

- [ ] T009 Implement environment schema and loader for API service in `gateway-api/src/config/env.ts`
- [ ] T010 Implement environment schema and loader for worker service in `gateway-worker/src/config/env.ts`
- [ ] T011 [P] Define shared courier event and queue payload types in `packages/shared/src/contracts/event-contract.ts`
- [ ] T012 [P] Define shared error codes and classification types in `packages/shared/src/contracts/error-contract.ts`
- [ ] T013 [P] Implement shared HMAC utility and timing-safe comparison in `packages/shared/src/crypto/hmac.ts`
- [ ] T014 [P] Implement shared structured logger factory in `packages/shared/src/logging/logger.ts`
- [ ] T015 Implement Mongo connection manager and collection accessors for API in `gateway-api/src/config/mongo.ts`
- [ ] T016 Implement Mongo connection manager and collection accessors for worker in `gateway-worker/src/config/mongo.ts`
- [ ] T053 [P] Add Mongo index and TTL initialization scripts for all required collections in `scripts/db/init-indexes.ts`
- [ ] T017 Implement Redis and BullMQ queue client factory for API producer in `gateway-api/src/config/queue.ts`
- [ ] T018 Implement Redis and BullMQ queue client factory for worker consumer in `gateway-worker/src/config/queue.ts`
- [ ] T019 Implement Docker Compose stack with health checks and dependency ordering in `docker-compose.yml`
- [ ] T020 Add API and worker Dockerfiles with multi-stage build, non-root runtime, HEALTHCHECK instruction, and proper `.dockerignore` (Constitution §12) in `gateway-api/Dockerfile`, `gateway-worker/Dockerfile`, and `.dockerignore`

**Checkpoint**: Foundation ready. User stories can now proceed.

---

## Phase 3: User Story 1 - Receive and Acknowledge Courier Events (Priority: P1) 🎯 MVP

**Goal**: Accept signed courier events, validate them, enqueue them, and return fast acknowledgements.

**Independent Test**: Submit valid and invalid signed events to the ingestion endpoint; verify valid events return `202` quickly and invalid requests return explicit errors without enqueueing.

### Tests for User Story 1

- [ ] T021 [P] [US1] Add ingestion API contract tests for `POST /v1/events/courier` in `gateway-api/tests/contract/ingestion-api.contract.test.ts`
- [ ] T022 [P] [US1] Add signature validation unit tests for HMAC verification in `gateway-api/tests/unit/signature-guard.test.ts`
- [ ] T023 [P] [US1] Add integration test for validate-enqueue-ack flow in `gateway-api/tests/integration/ingestion-flow.test.ts`
- [ ] T063 [P] [US1] Add unit tests for payload schema validation edge cases in `gateway-api/tests/unit/courier-event-schema.test.ts`

### Implementation for User Story 1

- [ ] T024 [P] [US1] Implement inbound payload schema validation in `gateway-api/src/validators/courier-event.schema.ts`
- [ ] T025 [P] [US1] Implement Fastify raw-body signature middleware in `gateway-api/src/middleware/signature-guard.ts`
- [ ] T026 [P] [US1] Implement ingestion record repository for accepted/rejected intake metadata in `gateway-api/src/repositories/ingestion-record.repository.ts`
- [ ] T027 [US1] Implement queue producer service for accepted events in `gateway-api/src/services/enqueue-event.service.ts`
- [ ] T028 [US1] Implement ingestion controller for ack and error responses in `gateway-api/src/controllers/ingestion.controller.ts`
- [ ] T029 [US1] Register ingestion route contract and handler in `gateway-api/src/routes/ingestion.routes.ts`
- [ ] T030 [US1] Implement API health endpoint with Redis and Mongo status in `gateway-api/src/health/health.route.ts`
- [ ] T031 [US1] Wire API bootstrap, middleware, routes, and graceful shutdown hooks in `gateway-api/src/main.ts`

**Checkpoint**: US1 is independently functional and testable as MVP.

---

## Phase 4: User Story 2 - Process Events Reliably in Background (Priority: P2)

**Goal**: Process queued events asynchronously with idempotency, retry policy, and DLQ routing for exhausted/permanent failures.

**Independent Test**: Enqueue controlled transient, permanent, and duplicate jobs; verify retries/backoff behavior, duplicate suppression, and DLQ persistence/routing.

### Tests for User Story 2

- [ ] T032 [P] [US2] Add worker contract tests for main and DLQ payload shapes in `gateway-worker/tests/contract/queue-job.contract.test.ts`
- [ ] T033 [P] [US2] Add unit tests for transient/permanent error classification in `gateway-worker/tests/unit/error-classification.test.ts`
- [ ] T034 [P] [US2] Add integration test for retry with exponential backoff and jitter in `gateway-worker/tests/integration/retry-policy.test.ts`
- [ ] T035 [P] [US2] Add integration test for duplicate suppression by idempotency key in `gateway-worker/tests/integration/idempotency-flow.test.ts`
- [ ] T036 [P] [US2] Add integration test for exhausted jobs routed to DLQ in `gateway-worker/tests/integration/dlq-routing.test.ts`
- [ ] T064 [P] [US2] Add unit tests for retry policy delay calculation and jitter bounds in `gateway-worker/tests/unit/retry-policy.test.ts`
- [ ] T065 [P] [US2] Add unit tests for idempotency key derivation determinism in `gateway-worker/tests/unit/idempotency-key.test.ts`
- [ ] T066 [US2] Add full pipeline end-to-end integration test (API ingest → queue → worker → terminal state) in `tests/integration/full-pipeline.test.ts`

### Implementation for User Story 2

- [ ] T037 [P] [US2] Implement `processed_events` repository with unique-key and status queries in `gateway-worker/src/repositories/processed-events.repository.ts`
- [ ] T038 [P] [US2] Implement `active_shipments` repository with shipment/order lookups in `gateway-worker/src/repositories/active-shipments.repository.ts`
- [ ] T039 [P] [US2] Implement `dead_letter_events` repository with attempt history persistence in `gateway-worker/src/repositories/dead-letter-events.repository.ts`
- [ ] T040 [P] [US2] Implement retry policy utility (attempts, backoff, jitter) in `gateway-worker/src/queue/retry-policy.ts`
- [ ] T041 [P] [US2] Implement error classifier utility for transient vs permanent failures in `gateway-worker/src/processors/error-classifier.ts`
- [ ] T042 [US2] Implement idempotency coordinator for check-before-process and terminal writes in `gateway-worker/src/processors/idempotency-coordinator.ts`
- [ ] T043 [US2] Implement event processor for shipment context updates and outcome handling in `gateway-worker/src/processors/process-event.ts`
- [ ] T044 [US2] Implement BullMQ worker consumer with retry and DLQ publishing in `gateway-worker/src/queue/worker.ts`
- [ ] T045 [US2] Wire worker bootstrap and graceful shutdown drain/requeue behavior in `gateway-worker/src/main.ts`
- [ ] T058 [US2] Implement DLQ replay CLI/script for manual reprocessing in `scripts/dlq/replay-dlq.ts`
- [ ] T062 [US2] Implement worker health check mechanism (heartbeat or lightweight probe) in `gateway-worker/src/health/health.ts`

**Checkpoint**: US2 is independently functional and testable on top of foundation.

---

## Phase 5: User Story 3 - Prove Operability and Readiness (Priority: P3)

**Goal**: Provide reproducible runtime startup, load-test proof for 100 concurrent requests, and operator documentation.

**Independent Test**: A new engineer follows docs to run the stack, execute duplicate-aware 100-concurrency load test, and produce reproducible results.

### Tests for User Story 3

- [ ] T046 [P] [US3] Add quickstart verification integration test for compose health and basic flow in `tests/integration/quickstart-validation.test.ts`
- [ ] T047 [P] [US3] Add load-test assertion script verifying all success criteria (SC-001 latency, SC-002 terminal completeness, SC-003 duplicate suppression, SC-004 retry recovery ratio) in `scripts/load-test/assert-thresholds.ts`

### Implementation for User Story 3

- [ ] T048 [P] [US3] Implement signed event generator utility for tests and load scripts in `scripts/signing/generate-signed-event.ts`
- [ ] T049 [US3] Implement 100-concurrency load-test runner with duplicate injection mode in `scripts/load-test/run-load-test.ts`
- [ ] T050 [US3] Implement load-test metrics report writer for latency/retry/DLQ outcomes in `scripts/load-test/reporter.ts`
- [ ] T051 [US3] Document full local runbook, env setup, and troubleshooting in `README.md`
- [ ] T052 [US3] Document load-test execution and evidence capture process in `docs/load-test-proof.md`

**Checkpoint**: US3 is independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, documentation deliverables, and cross-cutting validation.

- [ ] T054 [P] Add unified run scripts for API, worker, and full stack in `package.json`
- [ ] T055 Validate graceful shutdown behavior under in-flight load and document findings in `docs/graceful-shutdown-validation.md`
- [ ] T056 [P] Add final architecture and responsibility boundaries document in `docs/architecture.md`
- [ ] T057 Run end-to-end quickstart verification and record results in `specs/001-build-event-orchestration-gateway/quickstart.md`
- [ ] T059 [P] Document HTTP endpoint contracts (request/response schemas, status codes) in `docs/api.md`
- [ ] T060 [P] Document queue topology, job schemas, retry policies, and DLQ procedures in `docs/queues.md`
- [ ] T061 Document operational runbook for deployment, monitoring, and DLQ reprocessing in `docs/runbook.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2.
- **Phase 4 (US2)**: Depends on Phase 2 and can run in parallel with US1 after foundation, though recommended after US1 MVP validation.
- **Phase 5 (US3)**: Depends on Phase 2 and service capabilities from US1 and US2 for full validation evidence.
- **Phase 6 (Polish)**: Depends on completed target user stories.

### User Story Dependency Graph

- `US1 -> MVP`
- `US2 -> relies on queue input path enabled by US1`
- `US3 -> validates full system behavior from US1 + US2`

Recommended completion order: `US1 -> US2 -> US3`.

### Within Each User Story

- Tests first, then implementation.
- Repositories/utilities before service orchestration.
- Services before route/worker wiring.
- Story checkpoint validation before moving to next priority.

### Parallel Opportunities

- Setup: T003, T004, T005, T006, T007, T008 can run in parallel after T001/T002.
- Foundation: T011-T014 can run in parallel; T015/T016/T053 can proceed together; T017/T018 in parallel.
- US1: T021-T023, T063 parallel; T024-T026 parallel; then T027-T031 sequential.
- US2: T032-T036, T064, T065 parallel; T066 after T045; T037-T041 parallel; then T042-T045, T058, T062 sequential.
- US3: T046-T048 parallel; then T049-T052.
- Polish: T054, T056, T059, T060 parallel; then T055, T057, T061.

---

## Parallel Example: User Story 1

```bash
# Run US1 tests together
Task: "T021 [US1] ingestion API contract tests in gateway-api/tests/contract/ingestion-api.contract.test.ts"
Task: "T022 [US1] signature validation tests in gateway-api/tests/unit/signature-guard.test.ts"
Task: "T023 [US1] ingestion integration flow in gateway-api/tests/integration/ingestion-flow.test.ts"

# Build US1 independent components together
Task: "T024 [US1] payload schema in gateway-api/src/validators/courier-event.schema.ts"
Task: "T025 [US1] signature guard in gateway-api/src/middleware/signature-guard.ts"
Task: "T026 [US1] ingestion repository in gateway-api/src/repositories/ingestion-record.repository.ts"
```

## Parallel Example: User Story 2

```bash
# Run US2 tests together
Task: "T032 [US2] queue contract tests in gateway-worker/tests/contract/queue-job.contract.test.ts"
Task: "T033 [US2] error classification unit tests in gateway-worker/tests/unit/error-classification.test.ts"
Task: "T034 [US2] retry integration test in gateway-worker/tests/integration/retry-policy.test.ts"
Task: "T035 [US2] idempotency integration test in gateway-worker/tests/integration/idempotency-flow.test.ts"
Task: "T036 [US2] DLQ integration test in gateway-worker/tests/integration/dlq-routing.test.ts"

# Build US2 repositories/utilities together
Task: "T037 [US2] processed events repository in gateway-worker/src/repositories/processed-events.repository.ts"
Task: "T038 [US2] active shipments repository in gateway-worker/src/repositories/active-shipments.repository.ts"
Task: "T039 [US2] dead letter repository in gateway-worker/src/repositories/dead-letter-events.repository.ts"
Task: "T040 [US2] retry policy utility in gateway-worker/src/queue/retry-policy.ts"
Task: "T041 [US2] error classifier in gateway-worker/src/processors/error-classifier.ts"
```

## Parallel Example: User Story 3

```bash
# Build operability/testing tools together
Task: "T046 [US3] quickstart validation test in tests/integration/quickstart-validation.test.ts"
Task: "T047 [US3] load threshold assertions in scripts/load-test/assert-thresholds.ts"
Task: "T048 [US3] signed event generator in scripts/signing/generate-signed-event.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational).
3. Complete Phase 3 (US1).
4. Validate US1 independent test criteria.
5. Demo MVP ingestion + acknowledgement flow.

### Incremental Delivery

1. Deliver US1 (fast signed ingestion + queue ack).
2. Deliver US2 (idempotent background processing + retry + DLQ).
3. Deliver US3 (operability docs + load-test proof).
4. Complete Phase 6 polish and cross-cutting hardening.

### Parallel Team Strategy

1. Team aligns on Setup + Foundation together.
2. After foundation:
   - Engineer A drives US1 API path.
   - Engineer B drives US2 worker path.
   - Engineer C prepares US3 scripts/docs once US1 and US2 interfaces stabilize.
3. Merge by phase checkpoints with contract compatibility checks.

---

## Notes

- `[P]` tasks are parallel-safe by file separation and dependency boundaries.
- `[US1]`, `[US2]`, `[US3]` map directly to prioritized user stories in `spec.md`.
- Each user story phase has independent tests and a completion checkpoint.
- Tasks are intentionally specific so an implementation agent can execute without extra planning.

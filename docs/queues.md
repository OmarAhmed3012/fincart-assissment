# Queue Topology and Processing

## Queue Topology

- Main queue: `courier-events-main`
- DLQ queue: `courier-events-dlq`
- Transport: Redis via BullMQ
- Producer: `gateway-api`
- Consumer: `gateway-worker`

## Main Queue Payload

```json
{
  "eventId": "evt_123",
  "eventType": "shipment.status.updated",
  "occurredAt": "2026-02-26T12:00:00Z",
  "source": "courier-x",
  "idempotencyKey": "courier-x:evt_123",
  "traceId": "req_a1b2c3",
  "signatureMeta": {
    "algorithm": "hmac-sha256",
    "timestamp": 1772107200,
    "signature": "hex-or-base64"
  },
  "payload": {
    "shipmentId": "shp_456",
    "orderId": "ord_789",
    "status": "out_for_delivery"
  },
  "receivedAt": "2026-02-26T12:00:01Z",
  "attempt": 1
}
```

Validation rules:

- `eventId`, `idempotencyKey`, `eventType`, `traceId`, and `payload` are required.
- `attempt` starts at 1 and increments per retry cycle.

## DLQ Payload

```json
{
  "eventId": "evt_123",
  "idempotencyKey": "courier-x:evt_123",
  "traceId": "req_a1b2c3",
  "attemptCount": 5,
  "terminalReasonCode": "DOWNSTREAM_TIMEOUT_EXHAUSTED",
  "terminalReasonMessage": "Retries exhausted after transient timeouts",
  "attemptHistory": [
    {
      "attempt": 1,
      "outcome": "failed",
      "errorCode": "TIMEOUT"
    }
  ],
  "payloadSnapshot": {
    "shipmentId": "shp_456",
    "orderId": "ord_789",
    "status": "out_for_delivery"
  },
  "deadLetteredAt": "2026-02-26T12:05:00Z"
}
```

## Retry Policy

- Max attempts: 5 (`RETRY_MAX_ATTEMPTS`)
- Base delay: 1000 ms (`RETRY_BACKOFF_BASE_MS`)
- Multiplier: 2x (`RETRY_BACKOFF_MULTIPLIER`)
- Jitter: 0–20% (`RETRY_JITTER_PERCENT`)

Formula:

`delay = baseMs * multiplier^(attempt-1) + random(0, jitterPercent% * delay)`

- Transient errors are retried to max attempts.
- Permanent errors bypass retry and go directly to DLQ.

## Error Classification

- Transient: `ECONNREFUSED`, `ETIMEDOUT`, timeout-type errors.
- Permanent: validation/malformed/invalid payload errors.
- Unknown: treated as transient by default.

## DLQ Procedures

- Terminal failures are persisted in MongoDB `dead_letter_events` and also published to `courier-events-dlq`.
- Manual replay command:
  - `npx tsx scripts/dlq/replay-dlq.ts --limit N`
- Review states:
  - `pending -> reviewed -> replayed -> closed`
- DLQ TTL: 90 days (`DLQ_TTL_DAYS`)

## Idempotency

- Key: `idempotencyKey` from ingestion payload.
- Store: `processed_events` collection.
- Pattern: check-before-process.
- Lifecycle states:
  - `received -> processing -> processed`
  - `received -> processing -> failed -> processing`
  - `failed -> dead_lettered`
- TTL: 30 days for terminal records.

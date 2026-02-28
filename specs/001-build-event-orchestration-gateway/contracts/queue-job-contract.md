# Contract: Queue Job Payload

## Purpose

Defines the message contract exchanged through Redis-backed BullMQ queues between `gateway-api` and `gateway-worker`.

## Queues

- **Main queue**: `courier-events-main`
- **Dead-letter queue**: `courier-events-dlq`

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

## Validation Rules

- `eventId`, `idempotencyKey`, `eventType`, `traceId`, and `payload` are required for main queue jobs.
- `attempt` starts at 1 and increments per retry.
- DLQ payload requires `terminalReasonCode`, `attemptCount`, and `deadLetteredAt`.
- `attemptCount` must be equal to the number of recorded attempts.

## Error Classification Contract

- **Transient**: timeouts, temporary network/database unavailability, dependency throttling.
- **Permanent**: malformed business payload, irrecoverable domain validation failure, non-retryable dependency rejection.
- Worker applies retry only for transient errors; permanent errors go directly to DLQ persistence + DLQ queue.

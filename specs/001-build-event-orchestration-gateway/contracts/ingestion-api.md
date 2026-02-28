# Contract: Event Ingestion API

## Purpose

Defines the external HTTP contract exposed by `gateway-api` for courier event ingestion.

## Endpoint

- **Method**: `POST`
- **Path**: `/v1/events/courier`
- **Auth model**: HMAC-style request signature in headers.

## Required Request Headers

- `x-signature`: computed request signature.
- `x-signature-timestamp`: unix timestamp used in signature base string.
- `x-signature-algorithm`: signing algorithm identifier.
- `x-request-id`: caller-provided unique request trace value.
- `content-type`: `application/json`.

## Request Body

```json
{
  "eventId": "evt_123",
  "eventType": "shipment.status.updated",
  "occurredAt": "2026-02-26T12:00:00Z",
  "source": "courier-x",
  "idempotencyKey": "courier-x:evt_123",
  "payload": {
    "shipmentId": "shp_456",
    "orderId": "ord_789",
    "status": "out_for_delivery"
  }
}
```

## Response Contract

### Accepted

- **Status**: `202 Accepted`
- **Body**:

```json
{
  "acknowledged": true,
  "eventId": "evt_123",
  "idempotencyKey": "courier-x:evt_123",
  "traceId": "req_a1b2c3",
  "queued": true,
  "receivedAt": "2026-02-26T12:00:01Z"
}
```

### Invalid Signature or Payload

- **Status**: `400` or `401`
- **Body**:

```json
{
  "acknowledged": false,
  "errorCode": "INVALID_SIGNATURE",
  "message": "Signature verification failed",
  "traceId": "req_a1b2c3"
}
```

### Temporary Intake Failure

- **Status**: `503`
- **Body**:

```json
{
  "acknowledged": false,
  "errorCode": "INTAKE_UNAVAILABLE",
  "message": "Event intake temporarily unavailable",
  "traceId": "req_a1b2c3"
}
```

## Performance Target

- **p95 ingestion response time ≤ 150ms** under normal load (Constitution §3 hard target).
- Under 100-concurrent-submission load test: ≥ 99% acknowledged within 2 seconds (SC-001).

## Health Endpoint

- **Method**: `GET`
- **Path**: `/health`
- **Response** (200 OK):

```json
{
  "status": "healthy",
  "redis": "connected",
  "mongo": "connected",
  "timestamp": "2026-02-26T12:00:00Z"
}
```

- Must report connectivity status for Redis and MongoDB (Constitution §10).
- Must be lightweight and impose no load on downstream systems.

## Behavioral Guarantees

- API acknowledgement does not imply business processing completion.
- Duplicate submissions with the same `idempotencyKey` are accepted safely without duplicate business outcomes.
- Processing status is eventually reflected through internal persistence and queue lifecycle.
- HMAC signature verification uses timing-safe comparison (`crypto.timingSafeEqual`) over raw request bytes (Constitution §4).
- Raw request body MUST be captured before JSON parsing via Fastify raw body plugin.

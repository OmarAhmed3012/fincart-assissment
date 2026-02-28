# API Contract

## POST /v1/events/courier

### Required Headers

- `content-type: application/json`
- `x-signature: <hex hmac>`
- `x-signature-timestamp: <unix seconds>`
- `x-signature-algorithm: hmac-sha256`
- `x-request-id: <client trace id>`

### Request Body

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

### Responses

- `202 Accepted`

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

- `400 Bad Request`

```json
{
  "acknowledged": false,
  "errorCode": "INVALID_PAYLOAD",
  "message": "Request payload failed validation",
  "traceId": "req_a1b2c3"
}
```

- `401 Unauthorized`

```json
{
  "acknowledged": false,
  "errorCode": "INVALID_SIGNATURE",
  "message": "Signature verification failed",
  "traceId": "req_a1b2c3"
}
```

- `503 Service Unavailable`

```json
{
  "acknowledged": false,
  "errorCode": "INTAKE_UNAVAILABLE",
  "message": "Event intake temporarily unavailable",
  "traceId": "req_a1b2c3"
}
```

### Additional Notes

- Content type is JSON.
- Rate limiting is not enforced in-app.
- Body size limit follows Fastify route bodyLimit for ingestion.

## GET /health

- No authentication required.

- `200 OK`

```json
{
  "status": "healthy",
  "redis": "connected",
  "mongo": "connected",
  "timestamp": "2026-02-26T12:00:00Z"
}
```

- `503 Service Unavailable`

```json
{
  "status": "unhealthy",
  "redis": "disconnected",
  "mongo": "disconnected",
  "timestamp": "2026-02-26T12:00:00Z"
}
```

## HMAC Signing Reference

1. Serialize request body to raw JSON string.
2. Compute HMAC-SHA256 over raw body bytes.
3. Send signature headers with timestamp and algorithm.

Node.js example:

```javascript
import crypto from 'node:crypto';

const rawBody = Buffer.from(jsonString, 'utf-8');
const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
```

- `x-signature`: hex HMAC
- `x-signature-timestamp`: unix seconds
- `x-signature-algorithm`: `hmac-sha256`
- Tolerance window: 300 seconds (configurable via `SIGNATURE_TOLERANCE_SECONDS`)

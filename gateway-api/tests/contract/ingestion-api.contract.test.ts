import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { describe, expect, it, vi } from 'vitest';

import { computeHmacHex } from '@fincart/shared';

import { registerIngestionRoutes } from '../../src/routes/ingestion.routes.js';

const SIGNING_SECRET = 'test-signing-secret';

function buildSignedHeaders(body: string, timestampSeconds: number) {
  const signature = computeHmacHex(Buffer.from(body), SIGNING_SECRET, 'sha256');

  return {
    'content-type': 'application/json',
    'x-signature': signature,
    'x-signature-algorithm': 'hmac-sha256',
    'x-signature-timestamp': String(timestampSeconds),
    'x-request-id': 'req_contract_1',
  };
}

describe('POST /v1/events/courier contract', () => {
  it('returns 202 with accepted contract body for valid request', async () => {
    const app = Fastify();
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: false,
      runFirst: true,
    });

    const queueAdd = vi.fn().mockResolvedValue(undefined);
    const repository = {
      recordAccepted: vi.fn().mockResolvedValue(undefined),
      recordRejected: vi.fn().mockResolvedValue(undefined),
      recordEnqueueFailure: vi.fn().mockResolvedValue(undefined),
    };

    await registerIngestionRoutes(app, {
      queue: { add: queueAdd },
      repository,
      signingSecret: SIGNING_SECRET,
      signatureToleranceSeconds: 300,
    });

    const body = JSON.stringify({
      eventId: 'evt_123',
      eventType: 'shipment.status.updated',
      occurredAt: '2026-02-26T12:00:00Z',
      source: 'courier-x',
      idempotencyKey: 'courier-x:evt_123',
      payload: {
        shipmentId: 'shp_456',
        orderId: 'ord_789',
      },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/courier',
      payload: body,
      headers: buildSignedHeaders(body, timestamp),
    });

    expect(response.statusCode).toBe(202);
    const responseBody = response.json();
    expect(responseBody.acknowledged).toBe(true);
    expect(responseBody.eventId).toBe('evt_123');
    expect(responseBody.idempotencyKey).toBe('courier-x:evt_123');
    expect(responseBody.traceId).toBe('req_contract_1');
    expect(responseBody.queued).toBe(true);
    expect(typeof responseBody.receivedAt).toBe('string');
  });

  it('returns 401 with signature error shape when signature is invalid', async () => {
    const app = Fastify();
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: false,
      runFirst: true,
    });

    await registerIngestionRoutes(app, {
      queue: { add: vi.fn().mockResolvedValue(undefined) },
      repository: {
        recordAccepted: vi.fn().mockResolvedValue(undefined),
        recordRejected: vi.fn().mockResolvedValue(undefined),
        recordEnqueueFailure: vi.fn().mockResolvedValue(undefined),
      },
      signingSecret: SIGNING_SECRET,
      signatureToleranceSeconds: 300,
    });

    const body = JSON.stringify({
      eventId: 'evt_123',
      eventType: 'shipment.status.updated',
      occurredAt: '2026-02-26T12:00:00Z',
      source: 'courier-x',
      idempotencyKey: 'courier-x:evt_123',
      payload: { shipmentId: 'shp_456' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/courier',
      payload: body,
      headers: {
        ...buildSignedHeaders(body, Math.floor(Date.now() / 1000)),
        'x-signature': 'deadbeef',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      acknowledged: false,
      errorCode: 'INVALID_SIGNATURE',
      traceId: 'req_contract_1',
    });
  });

  it('returns 400 with payload error shape for invalid body', async () => {
    const app = Fastify();
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: false,
      runFirst: true,
    });

    await registerIngestionRoutes(app, {
      queue: { add: vi.fn().mockResolvedValue(undefined) },
      repository: {
        recordAccepted: vi.fn().mockResolvedValue(undefined),
        recordRejected: vi.fn().mockResolvedValue(undefined),
        recordEnqueueFailure: vi.fn().mockResolvedValue(undefined),
      },
      signingSecret: SIGNING_SECRET,
      signatureToleranceSeconds: 300,
    });

    const body = JSON.stringify({
      eventId: '',
      eventType: 'shipment.status.updated',
      occurredAt: '2026-02-26T12:00:00Z',
      source: 'courier-x',
      idempotencyKey: 'courier-x:evt_123',
      payload: { shipmentId: 'shp_456' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/courier',
      payload: body,
      headers: buildSignedHeaders(body, Math.floor(Date.now() / 1000)),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      acknowledged: false,
      errorCode: 'INVALID_PAYLOAD',
      traceId: 'req_contract_1',
    });
  });

  it('returns 503 with intake unavailable shape when enqueue fails', async () => {
    const app = Fastify();
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: false,
      runFirst: true,
    });

    await registerIngestionRoutes(app, {
      queue: { add: vi.fn().mockRejectedValue(new Error('Redis down')) },
      repository: {
        recordAccepted: vi.fn().mockResolvedValue(undefined),
        recordRejected: vi.fn().mockResolvedValue(undefined),
        recordEnqueueFailure: vi.fn().mockResolvedValue(undefined),
      },
      signingSecret: SIGNING_SECRET,
      signatureToleranceSeconds: 300,
    });

    const body = JSON.stringify({
      eventId: 'evt_503',
      eventType: 'shipment.status.updated',
      occurredAt: '2026-02-26T12:00:00Z',
      source: 'courier-x',
      idempotencyKey: 'courier-x:evt_503',
      payload: { shipmentId: 'shp_503' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/courier',
      payload: body,
      headers: buildSignedHeaders(body, Math.floor(Date.now() / 1000)),
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      acknowledged: false,
      errorCode: 'INTAKE_UNAVAILABLE',
    });
    expect(response.json().traceId).toBeTruthy();
  });
});

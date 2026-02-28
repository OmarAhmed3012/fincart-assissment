import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { describe, expect, it, vi } from 'vitest';

import { computeHmacHex } from '@fincart/shared';

import { registerIngestionRoutes } from '../../src/routes/ingestion.routes.js';

describe('ingestion flow integration', () => {
  it('validates, enqueues, and acknowledges accepted events', async () => {
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
      signingSecret: 'integration-secret',
      signatureToleranceSeconds: 300,
    });

    const eventBody = {
      eventId: 'evt_222',
      eventType: 'shipment.status.updated',
      occurredAt: '2026-02-26T12:00:00Z',
      source: 'courier-x',
      idempotencyKey: 'courier-x:evt_222',
      payload: {
        shipmentId: 'shp_999',
      },
    };

    const payload = JSON.stringify(eventBody);
    const signature = computeHmacHex(Buffer.from(payload), 'integration-secret', 'sha256');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/courier',
      payload,
      headers: {
        'content-type': 'application/json',
        'x-signature': signature,
        'x-signature-algorithm': 'hmac-sha256',
        'x-signature-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-request-id': 'req_integration_1',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(queueAdd).toHaveBeenCalledTimes(1);

    const [jobName, jobPayload] = queueAdd.mock.calls[0] as [string, Record<string, unknown>];
    expect(jobName).toBe('courier-event');
    expect(jobPayload.eventId).toBe(eventBody.eventId);
    expect(jobPayload.idempotencyKey).toBe(eventBody.idempotencyKey);
    expect(jobPayload.traceId).toBe('req_integration_1');
    expect(jobPayload.attempt).toBe(1);

    expect(repository.recordAccepted).toHaveBeenCalledTimes(1);
    expect(repository.recordRejected).not.toHaveBeenCalled();
  });
});

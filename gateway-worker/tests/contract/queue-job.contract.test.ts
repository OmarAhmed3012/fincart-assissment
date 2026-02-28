import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const queueJobPayloadSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  occurredAt: z.string(),
  source: z.string(),
  signatureMeta: z.object({
    algorithm: z.string(),
    timestamp: z.number(),
    signatureHeader: z.string(),
  }),
  idempotencyKey: z.string(),
  traceId: z.string(),
  attempt: z.number(),
  payload: z.record(z.string(), z.unknown()),
  receivedAt: z.string(),
});

const dlqPayloadSchema = z.object({
  eventId: z.string(),
  idempotencyKey: z.string(),
  traceId: z.string(),
  attemptCount: z.number(),
  terminalReasonCode: z.string(),
  terminalReasonMessage: z.string(),
  attemptHistory: z.array(z.record(z.string(), z.unknown())),
  payloadSnapshot: z.record(z.string(), z.unknown()),
  deadLetteredAt: z.string(),
});

describe('queue contract', () => {
  it('validates main queue payload shape', () => {
    const result = queueJobPayloadSchema.safeParse({
      eventId: 'evt_1',
      eventType: 'shipment.status.updated',
      occurredAt: '2026-02-26T12:00:00Z',
      source: 'courier-x',
      signatureMeta: {
        algorithm: 'sha256',
        timestamp: 1772107200,
        signatureHeader: 'abc123',
      },
      idempotencyKey: 'key_1',
      traceId: 'trace_1',
      attempt: 1,
      payload: { shipmentId: 'shp_1' },
      receivedAt: '2026-02-26T12:00:01Z',
    });

    expect(result.success).toBe(true);
  });

  it('validates dlq payload shape', () => {
    const result = dlqPayloadSchema.safeParse({
      eventId: 'evt_1',
      idempotencyKey: 'key_1',
      traceId: 'trace_1',
      attemptCount: 5,
      terminalReasonCode: 'RETRY_LIMIT_EXCEEDED',
      terminalReasonMessage: 'Retries exhausted',
      attemptHistory: [{ attempt: 1, errorCode: 'ETIMEDOUT' }],
      payloadSnapshot: { shipmentId: 'shp_1' },
      deadLetteredAt: '2026-02-26T12:05:00Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects main queue payload missing required fields', () => {
    const result = queueJobPayloadSchema.safeParse({
      eventId: 'evt_1',
    });

    expect(result.success).toBe(false);
  });

  it('rejects dlq payload missing required fields', () => {
    const result = dlqPayloadSchema.safeParse({
      eventId: 'evt_1',
    });

    expect(result.success).toBe(false);
  });
});

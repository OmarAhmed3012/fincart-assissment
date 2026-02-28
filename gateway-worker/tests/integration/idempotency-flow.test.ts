import { createLogger } from '@fincart/shared';
import { describe, expect, it, vi } from 'vitest';

import { processEvent } from '../../src/processors/process-event.js';

describe('idempotency flow integration', () => {
  it('suppresses duplicate side effects for same idempotency key', async () => {
    const state = new Map<string, { status: string; attemptCount: number }>();
    const upsertShipment = vi.fn().mockResolvedValue(undefined);

    const processedEvents = {
      findByIdempotencyKey: async (key: string) => state.get(key) ?? null,
      markReceived: async (record: { idempotencyKey: string }) => {
        if (!state.has(record.idempotencyKey)) {
          state.set(record.idempotencyKey, { status: 'received', attemptCount: 0 });
        }
      },
      markProcessing: async (key: string) => {
        const current = state.get(key);
        if (!current || (current.status !== 'received' && current.status !== 'failed')) {
          return null;
        }
        const next = { status: 'processing', attemptCount: current.attemptCount + 1 };
        state.set(key, next);
        return next;
      },
      markProcessed: async (key: string) => {
        const current = state.get(key) ?? { status: 'received', attemptCount: 1 };
        state.set(key, { ...current, status: 'processed' });
      },
      markFailed: async (_k: string, _c: string, _m: string, _a: number) => undefined,
      markDeadLettered: async () => undefined,
    };

    const payload = {
      eventId: 'evt_1',
      eventType: 'shipment.status.updated',
      occurredAt: '2026-02-26T12:00:00Z',
      source: 'courier-x',
      signatureMeta: {
        algorithm: 'sha256' as const,
        timestamp: 1772107200,
        signatureHeader: 'sig',
      },
      idempotencyKey: 'key_1',
      traceId: 'trace_1',
      attempt: 1,
      payload: {
        shipmentId: 'shp_1',
        orderId: 'ord_1',
        status: 'out_for_delivery',
      },
      receivedAt: '2026-02-26T12:00:01Z',
    };

    const logger = createLogger({ serviceName: 'worker-test', level: 'silent' });

    await processEvent(payload, {
      processedEvents,
      activeShipments: { upsertShipment },
      deadLetters: { persistDeadLetter: async () => undefined },
      dlqQueue: { add: async () => undefined },
      retryConfig: { baseMs: 1000, multiplier: 2, jitterPercent: 20, maxAttempts: 5 },
      logger,
    });

    await processEvent(payload, {
      processedEvents,
      activeShipments: { upsertShipment },
      deadLetters: { persistDeadLetter: async () => undefined },
      dlqQueue: { add: async () => undefined },
      retryConfig: { baseMs: 1000, multiplier: 2, jitterPercent: 20, maxAttempts: 5 },
      logger,
    });

    expect(upsertShipment).toHaveBeenCalledTimes(1);
    expect(state.get('key_1')?.status).toBe('processed');
  });
});

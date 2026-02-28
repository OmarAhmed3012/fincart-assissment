import { createLogger } from '@fincart/shared';
import { describe, expect, it, vi } from 'vitest';

import { processEvent } from '../../src/processors/process-event.js';

describe('dlq routing integration', () => {
  it('routes transient failures to DLQ after max attempts exhausted', async () => {
    const dlqAdd = vi.fn().mockResolvedValue(undefined);
    const persistDeadLetter = vi.fn().mockResolvedValue(undefined);

    const state = new Map<string, { status: string; attemptCount: number }>([
      ['key_transient', { status: 'failed', attemptCount: 4 }],
    ]);

    const processedEvents = {
      findByIdempotencyKey: async (key: string) => state.get(key) ?? null,
      markReceived: async () => undefined,
      markProcessing: async (key: string) => {
        const current = state.get(key) ?? { status: 'received', attemptCount: 0 };
        const next = { status: 'processing', attemptCount: current.attemptCount + 1 };
        state.set(key, next);
        return next;
      },
      markProcessed: async () => undefined,
      markFailed: async (_k: string, _c: string, _m: string, _a: number) => undefined,
      markDeadLettered: async (key: string) => {
        const current = state.get(key) ?? { status: 'processing', attemptCount: 1 };
        state.set(key, { ...current, status: 'dead_lettered' });
      },
    };

    await processEvent(
      {
        eventId: 'evt_transient',
        eventType: 'shipment.status.updated',
        occurredAt: '2026-02-26T12:00:00Z',
        source: 'courier-x',
        signatureMeta: { algorithm: 'sha256', timestamp: 1, signatureHeader: 'sig' },
        idempotencyKey: 'key_transient',
        traceId: 'trace_transient',
        attempt: 5,
        payload: { shipmentId: 'shp_1', status: 'in_transit' },
        receivedAt: '2026-02-26T12:00:01Z',
      },
      {
        processedEvents,
        activeShipments: {
          upsertShipment: async () => {
            const err = new Error('Timeout from downstream');
            err.name = 'TimeoutError';
            throw err;
          },
        },
        deadLetters: { persistDeadLetter },
        dlqQueue: { add: dlqAdd },
        retryConfig: { baseMs: 1000, multiplier: 2, jitterPercent: 20, maxAttempts: 5 },
        logger: createLogger({ serviceName: 'worker-test', level: 'silent' }),
      },
    );

    expect(persistDeadLetter).toHaveBeenCalledTimes(1);
    expect(dlqAdd).toHaveBeenCalledTimes(1);
    expect(state.get('key_transient')?.status).toBe('dead_lettered');
  });

  it('routes permanent failures to DLQ immediately without retry', async () => {
    const markFailed = vi
      .fn<
        (
          idempotencyKey: string,
          errorCode: string,
          errorMessage: string,
          attemptCount: number,
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined);
    const dlqAdd = vi.fn().mockResolvedValue(undefined);

    const processedEvents = {
      findByIdempotencyKey: async () => ({ status: 'received' }),
      markReceived: async () => undefined,
      markProcessing: async () => ({ attemptCount: 1 }),
      markProcessed: async () => undefined,
      markFailed,
      markDeadLettered: async () => undefined,
    };

    await processEvent(
      {
        eventId: 'evt_permanent',
        eventType: 'shipment.status.updated',
        occurredAt: '2026-02-26T12:00:00Z',
        source: 'courier-x',
        signatureMeta: { algorithm: 'sha256', timestamp: 1, signatureHeader: 'sig' },
        idempotencyKey: 'key_permanent',
        traceId: 'trace_permanent',
        attempt: 1,
        payload: { shipmentId: 'shp_1', status: 'malformed value' },
        receivedAt: '2026-02-26T12:00:01Z',
      },
      {
        processedEvents,
        activeShipments: {
          upsertShipment: async () => {
            throw new Error('Invalid payload malformed structure');
          },
        },
        deadLetters: { persistDeadLetter: async () => undefined },
        dlqQueue: { add: dlqAdd },
        retryConfig: { baseMs: 1000, multiplier: 2, jitterPercent: 20, maxAttempts: 5 },
        logger: createLogger({ serviceName: 'worker-test', level: 'silent' }),
      },
    );

    expect(markFailed).not.toHaveBeenCalled();
    expect(dlqAdd).toHaveBeenCalledTimes(1);
    const dlqPayload = dlqAdd.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(dlqPayload.attemptCount).toBe(1);
    expect(typeof dlqPayload.terminalReasonCode).toBe('string');
    expect(Array.isArray(dlqPayload.attemptHistory)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { buildIdempotencyKey } from '../../src/processors/idempotency-key.js';

describe('idempotency key', () => {
  it('returns the same key for the same input', () => {
    const input = {
      source: 'courier-x',
      eventId: 'evt_123',
      eventType: 'shipment.status.updated',
    };

    expect(buildIdempotencyKey(input)).toBe(buildIdempotencyKey(input));
  });

  it('returns different keys for different input', () => {
    const keyA = buildIdempotencyKey({
      source: 'courier-x',
      eventId: 'evt_123',
      eventType: 'shipment.status.updated',
    });
    const keyB = buildIdempotencyKey({
      source: 'courier-x',
      eventId: 'evt_124',
      eventType: 'shipment.status.updated',
    });

    expect(keyA).not.toBe(keyB);
  });

  it('is a pure function with no side effects', () => {
    const input = {
      source: 'courier-x',
      eventId: 'evt_999',
      eventType: 'shipment.status.updated',
    };
    const before = { ...input };

    void buildIdempotencyKey(input);

    expect(input).toEqual(before);
  });
});

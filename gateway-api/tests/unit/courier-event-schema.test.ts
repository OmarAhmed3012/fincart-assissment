import { describe, expect, it } from 'vitest';

import { validateCourierEvent } from '../../src/validators/courier-event.schema.js';

describe('courierEventSchema', () => {
  it('accepts a valid courier event payload', () => {
    const payload = {
      eventId: 'evt_123',
      eventType: 'shipment.status.updated',
      occurredAt: '2026-02-26T12:00:00Z',
      source: 'courier-x',
      idempotencyKey: 'courier-x:evt_123',
      payload: {
        shipmentId: 'shp_456',
      },
    };

    const result = validateCourierEvent(payload);
    expect(result).toEqual(payload);
  });

  it('rejects payload when required fields are missing', () => {
    expect(() =>
      validateCourierEvent({
        eventType: 'shipment.status.updated',
        occurredAt: '2026-02-26T12:00:00Z',
        source: 'courier-x',
        idempotencyKey: 'courier-x:evt_123',
        payload: {},
      }),
    ).toThrow();
  });

  it('rejects payload with invalid datetime format', () => {
    expect(() =>
      validateCourierEvent({
        eventId: 'evt_123',
        eventType: 'shipment.status.updated',
        occurredAt: '2026-02-26 12:00:00',
        source: 'courier-x',
        idempotencyKey: 'courier-x:evt_123',
        payload: {},
      }),
    ).toThrow();
  });

  it('rejects payload when payload field is not an object', () => {
    expect(() =>
      validateCourierEvent({
        eventId: 'evt_123',
        eventType: 'shipment.status.updated',
        occurredAt: '2026-02-26T12:00:00Z',
        source: 'courier-x',
        idempotencyKey: 'courier-x:evt_123',
        payload: 'invalid',
      }),
    ).toThrow();
  });
});

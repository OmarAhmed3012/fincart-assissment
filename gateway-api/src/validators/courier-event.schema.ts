import { z } from 'zod';

import type { CourierEvent } from '@fincart/shared';

const payloadSchema = z.record(z.string(), z.unknown());

export const courierEventSchema = z.object({
  eventId: z.string().trim().min(1),
  eventType: z.string().trim().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  source: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1),
  payload: payloadSchema,
});

export function validateCourierEvent(input: unknown): CourierEvent {
  return courierEventSchema.parse(input);
}

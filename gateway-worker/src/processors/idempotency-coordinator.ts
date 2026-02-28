import type { Logger } from 'pino';

interface ProcessedEventLookup {
  findByIdempotencyKey(key: string): Promise<{ status: string } | null>;
}

export type IdempotencyDecision =
  | { skip: false }
  | { skip: true; reason: 'already_processed' | 'dead_lettered' | 'in_progress' };

export async function checkIdempotency(
  repo: ProcessedEventLookup,
  idempotencyKey: string,
  logger: Logger,
): Promise<IdempotencyDecision> {
  const existing = await repo.findByIdempotencyKey(idempotencyKey);

  if (!existing) {
    return { skip: false };
  }

  if (existing.status === 'processed') {
    logger.info({ idempotencyKey }, 'Skipping already processed event');
    return { skip: true, reason: 'already_processed' };
  }

  if (existing.status === 'dead_lettered') {
    logger.info({ idempotencyKey }, 'Skipping dead-lettered event');
    return { skip: true, reason: 'dead_lettered' };
  }

  if (existing.status === 'processing') {
    logger.info({ idempotencyKey }, 'Skipping in-progress event');
    return { skip: true, reason: 'in_progress' };
  }

  return { skip: false };
}

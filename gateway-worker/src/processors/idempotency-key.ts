import { createHash } from 'node:crypto';

interface IdempotencyKeyInput {
  source: string;
  eventId: string;
  eventType: string;
}

export function buildIdempotencyKey(input: IdempotencyKeyInput): string {
  const normalized = `${input.source.trim()}::${input.eventId.trim()}::${input.eventType.trim()}`;
  return createHash('sha256').update(normalized).digest('hex');
}

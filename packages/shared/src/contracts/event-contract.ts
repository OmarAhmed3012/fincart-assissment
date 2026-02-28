import type { HmacAlgorithm } from '../crypto/hmac.js';

export interface SignatureMeta {
  algorithm: HmacAlgorithm;
  timestamp: number;
  signatureHeader: string;
}

export interface CourierEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  source: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface QueueJobPayload {
  eventId: string;
  eventType: string;
  occurredAt: string;
  source: string;
  signatureMeta: SignatureMeta;
  idempotencyKey: string;
  traceId: string;
  attempt: number;
  payload: Record<string, unknown>;
  receivedAt: string;
}

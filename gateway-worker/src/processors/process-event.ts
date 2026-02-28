import type { QueueJobPayload } from '@fincart/shared';
import type { Logger } from 'pino';

import type { DeadLetterAttempt } from '../repositories/dead-letter-events.repository.js';
import { classifyError } from './error-classifier.js';
import { checkIdempotency } from './idempotency-coordinator.js';
import {
  calculateBackoffDelay,
  shouldRetry,
  type RetryPolicyConfig,
} from '../queue/retry-policy.js';

interface ProcessedEventsRepo {
  findByIdempotencyKey(key: string): Promise<{
    status: string;
    attemptHistory?: DeadLetterAttempt[];
  } | null>;
  markReceived(record: {
    idempotencyKey: string;
    eventId: string;
    eventType: string;
  }): Promise<void>;
  markProcessing(idempotencyKey: string): Promise<{ attemptCount: number } | null>;
  markProcessed(idempotencyKey: string): Promise<void>;
  markFailed(
    idempotencyKey: string,
    errorCode: string,
    errorMessage: string,
    attemptCount: number,
  ): Promise<void>;
  markDeadLettered(idempotencyKey: string): Promise<void>;
}

interface ActiveShipmentsRepo {
  upsertShipment(record: {
    shipmentId: string;
    orderId?: string;
    currentState: string;
    lastEventId: string;
    lastEventType: string;
    lastEventAt: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

interface DeadLetterRepo {
  persistDeadLetter(record: {
    eventId: string;
    idempotencyKey: string;
    eventType: string;
    terminalReasonCode: string;
    terminalReasonMessage: string;
    attemptCount: number;
    attemptHistory: DeadLetterAttempt[];
    payloadSnapshot: Record<string, unknown>;
    traceId: string;
  }): Promise<void>;
}

interface DlqQueue {
  add(name: string, data: Record<string, unknown>): Promise<unknown>;
}

export interface ProcessEventDeps {
  processedEvents: ProcessedEventsRepo;
  activeShipments: ActiveShipmentsRepo;
  deadLetters: DeadLetterRepo;
  dlqQueue: DlqQueue;
  retryConfig: RetryPolicyConfig;
  logger: Logger;
}

export class RetryableProcessingError extends Error {
  public constructor(
    message: string,
    public readonly delayMs: number,
  ) {
    super(message);
    this.name = 'RetryableProcessingError';
  }
}

function getPayloadField(payload: Record<string, unknown>, key: string): string {
  const raw = payload[key];

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error(`Invalid payload: missing ${key}`);
  }

  return raw;
}

export async function processEvent(
  payload: QueueJobPayload,
  deps: ProcessEventDeps,
): Promise<void> {
  const logger = deps.logger;

  logger.info({ traceId: payload.traceId, eventId: payload.eventId }, 'Processing event started');

  const decision = await checkIdempotency(deps.processedEvents, payload.idempotencyKey, logger);
  if (decision.skip) {
    logger.info(
      { traceId: payload.traceId, reason: decision.reason },
      'Skipping event by idempotency gate',
    );
    return;
  }

  await deps.processedEvents.markReceived({
    idempotencyKey: payload.idempotencyKey,
    eventId: payload.eventId,
    eventType: payload.eventType,
  });

  const processingRecord = await deps.processedEvents.markProcessing(payload.idempotencyKey);
  if (!processingRecord) {
    logger.info({ traceId: payload.traceId }, 'Skipping event; processing lock not acquired');
    return;
  }

  const attempt = processingRecord.attemptCount;

  try {
    const shipmentId = getPayloadField(payload.payload, 'shipmentId');
    const currentState = getPayloadField(payload.payload, 'status');
    const orderIdRaw = payload.payload.orderId;
    const orderId =
      typeof orderIdRaw === 'string' && orderIdRaw.trim().length > 0 ? orderIdRaw : undefined;

    await deps.activeShipments.upsertShipment({
      shipmentId,
      orderId,
      currentState,
      lastEventId: payload.eventId,
      lastEventType: payload.eventType,
      lastEventAt: payload.occurredAt,
      metadata: payload.payload,
    });

    await deps.processedEvents.markProcessed(payload.idempotencyKey);
    logger.info({ traceId: payload.traceId, eventId: payload.eventId }, 'Processing completed');
  } catch (error) {
    const classified = classifyError(error);
    const retryAllowed = shouldRetry(
      attempt,
      deps.retryConfig.maxAttempts,
      classified.classification,
    );

    if (retryAllowed) {
      await deps.processedEvents.markFailed(
        payload.idempotencyKey,
        classified.code,
        classified.message,
        attempt,
      );
      const delay =
        calculateBackoffDelay(attempt, deps.retryConfig) ??
        deps.retryConfig.baseMs * deps.retryConfig.multiplier;
      logger.warn(
        {
          traceId: payload.traceId,
          attempt,
          delay,
          classification: classified.classification,
          code: classified.code,
        },
        'Retrying transient failure',
      );
      throw new RetryableProcessingError(classified.message, delay);
    }

    await deps.processedEvents.markDeadLettered(payload.idempotencyKey);

    const existingRecord = await deps.processedEvents.findByIdempotencyKey(payload.idempotencyKey);
    const previousHistory: DeadLetterAttempt[] = existingRecord?.attemptHistory ?? [];
    const attemptHistory: DeadLetterAttempt[] = [
      ...previousHistory,
      {
        attempt,
        errorCode: classified.code,
        message: classified.message,
        timestamp: new Date().toISOString(),
      },
    ];

    await deps.deadLetters.persistDeadLetter({
      eventId: payload.eventId,
      idempotencyKey: payload.idempotencyKey,
      eventType: payload.eventType,
      terminalReasonCode: classified.code,
      terminalReasonMessage: classified.message,
      attemptCount: attempt,
      attemptHistory,
      payloadSnapshot: payload.payload,
      traceId: payload.traceId,
    });

    await deps.dlqQueue.add('dead-letter-event', {
      eventId: payload.eventId,
      idempotencyKey: payload.idempotencyKey,
      traceId: payload.traceId,
      attemptCount: attempt,
      terminalReasonCode: classified.code,
      terminalReasonMessage: classified.message,
      attemptHistory,
      payloadSnapshot: payload.payload,
      deadLetteredAt: new Date().toISOString(),
    });

    logger.error(
      {
        traceId: payload.traceId,
        classification: classified.classification,
        code: classified.code,
      },
      'Event moved to dead-letter',
    );
  }
}

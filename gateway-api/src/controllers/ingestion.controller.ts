import type { FastifyReply, FastifyRequest } from 'fastify';

import type { QueueJobPayload } from '@fincart/shared';

import { enqueueEvent } from '../services/enqueue-event.service.js';
import { validateCourierEvent } from '../validators/courier-event.schema.js';

interface QueueProducer {
  add(name: string, data: QueueJobPayload): Promise<unknown>;
}

interface IngestionRecordWriter {
  recordAccepted(record: {
    traceId: string;
    eventId: string;
    idempotencyKey: string;
    source: string;
    createdAt: string;
  }): Promise<void>;
  recordRejected(record: {
    traceId: string;
    reason: string;
    createdAt: string;
    eventId?: string;
    idempotencyKey?: string;
    source?: string;
  }): Promise<void>;
  recordEnqueueFailure(record: {
    traceId: string;
    eventId: string;
    idempotencyKey: string;
    source: string;
    reason: string;
    createdAt: string;
  }): Promise<void>;
}

interface IngestionAcceptedResponse {
  acknowledged: true;
  eventId: string;
  idempotencyKey: string;
  traceId: string;
  queued: true;
  receivedAt: string;
}

interface IngestionErrorResponse {
  acknowledged: false;
  errorCode: 'INVALID_PAYLOAD' | 'INTAKE_UNAVAILABLE';
  message: string;
  traceId: string;
}

interface IngestionControllerDependencies {
  queue: QueueProducer;
  repository: IngestionRecordWriter;
}

function getTraceId(request: FastifyRequest): string {
  const requestIdHeader = request.headers['x-request-id'];

  if (typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0) {
    return requestIdHeader;
  }

  return request.id;
}

export function createIngestionController(dependencies: IngestionControllerDependencies) {
  return async function ingestionController(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const traceId = getTraceId(request);
    const receivedAt = new Date().toISOString();

    let eventBody;
    try {
      eventBody = validateCourierEvent(request.body);
    } catch {
      await dependencies.repository.recordRejected({
        traceId,
        reason: 'Payload validation failed',
        createdAt: receivedAt,
      });

      return reply.status(400).send({
        acknowledged: false,
        errorCode: 'INVALID_PAYLOAD',
        message: 'Request payload failed validation',
        traceId,
      } satisfies IngestionErrorResponse);
    }

    const signatureMeta = request.signatureMeta;
    if (!signatureMeta) {
      await dependencies.repository.recordRejected({
        traceId,
        reason: 'Signature metadata unavailable',
        createdAt: receivedAt,
        eventId: eventBody.eventId,
        idempotencyKey: eventBody.idempotencyKey,
        source: eventBody.source,
      });

      return reply.status(400).send({
        acknowledged: false,
        errorCode: 'INVALID_PAYLOAD',
        message: 'Signature metadata is missing',
        traceId,
      } satisfies IngestionErrorResponse);
    }

    const queuePayload: QueueJobPayload = {
      eventId: eventBody.eventId,
      eventType: eventBody.eventType,
      occurredAt: eventBody.occurredAt,
      source: eventBody.source,
      signatureMeta,
      idempotencyKey: eventBody.idempotencyKey,
      traceId,
      attempt: 1,
      payload: eventBody.payload,
      receivedAt,
    };

    await dependencies.repository.recordAccepted({
      traceId,
      eventId: eventBody.eventId,
      idempotencyKey: eventBody.idempotencyKey,
      source: eventBody.source,
      createdAt: receivedAt,
    });

    try {
      await enqueueEvent(dependencies.queue, queuePayload);
    } catch {
      await dependencies.repository.recordEnqueueFailure({
        traceId,
        eventId: eventBody.eventId,
        idempotencyKey: eventBody.idempotencyKey,
        source: eventBody.source,
        reason: 'Queue enqueue failed',
        createdAt: receivedAt,
      });

      return reply.status(503).send({
        acknowledged: false,
        errorCode: 'INTAKE_UNAVAILABLE',
        message: 'Event intake temporarily unavailable',
        traceId,
      } satisfies IngestionErrorResponse);
    }

    return reply.status(202).send({
      acknowledged: true,
      eventId: eventBody.eventId,
      idempotencyKey: eventBody.idempotencyKey,
      traceId,
      queued: true,
      receivedAt,
    } satisfies IngestionAcceptedResponse);
  };
}

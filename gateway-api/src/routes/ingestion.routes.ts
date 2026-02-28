import type { FastifyInstance } from 'fastify';

import type { QueueJobPayload } from '@fincart/shared';

import { createIngestionController } from '../controllers/ingestion.controller.js';
import { createSignatureGuard } from '../middleware/signature-guard.js';
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

interface QueueProducer {
  add(name: string, data: QueueJobPayload): Promise<unknown>;
}

interface RegisterIngestionRoutesOptions {
  queue: QueueProducer;
  repository: IngestionRecordWriter;
  signingSecret: string;
  signatureToleranceSeconds: number;
}

export async function registerIngestionRoutes(
  app: FastifyInstance,
  options: RegisterIngestionRoutesOptions,
): Promise<void> {
  app.post(
    '/v1/events/courier',
    {
      preHandler: createSignatureGuard({
        signingSecret: options.signingSecret,
        signatureToleranceSeconds: options.signatureToleranceSeconds,
      }),
      bodyLimit: 1024 * 1024,
    },
    createIngestionController({
      queue: options.queue,
      repository: options.repository,
    }),
  );
}

import type { QueueJobPayload } from '@fincart/shared';
import { withCorrelation } from '@fincart/shared';
import type { Job } from 'bullmq';
import type { Logger } from 'pino';

import {
  processEvent,
  RetryableProcessingError,
  type ProcessEventDeps,
} from '../processors/process-event.js';
import { calculateBackoffDelay } from './retry-policy.js';

export type EventJobProcessor = (job: Job<QueueJobPayload>) => Promise<void>;

interface WorkerProcessorDeps extends Omit<ProcessEventDeps, 'logger'> {
  logger: Logger;
}

export function createEventJobProcessor(deps: WorkerProcessorDeps): EventJobProcessor {
  return async (job: Job<QueueJobPayload>): Promise<void> => {
    const payload = job.data;
    const logger = withCorrelation(deps.logger, {
      traceId: payload.traceId,
      requestId: payload.traceId,
    });

    const currentAttempt = Math.max(1, job.attemptsMade + 1);

    try {
      await processEvent(
        {
          ...payload,
          attempt: currentAttempt,
        },
        {
          ...deps,
          logger,
        },
      );
    } catch (error) {
      if (error instanceof RetryableProcessingError) {
        const computedDelay =
          calculateBackoffDelay(currentAttempt, deps.retryConfig) ?? error.delayMs;
        logger.warn(
          { attempt: currentAttempt, delayMs: computedDelay },
          'Transient failure captured for retry scheduling',
        );
      }

      throw error;
    }
  };
}

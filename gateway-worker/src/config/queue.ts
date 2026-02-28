import { type Job, Worker } from 'bullmq';
import { Redis, type RedisOptions } from 'ioredis';

import type { QueueJobPayload } from '@fincart/shared';

const EVENT_QUEUE_NAME = 'courier-events-main';

export function createRedisConnection(opts: RedisOptions): Redis {
  const connection = new Redis(opts);
  return connection;
}

export function createWorkerQueue(
  connection: Redis,
  concurrency: number,
  processor: (job: Job<QueueJobPayload>) => Promise<void>,
): Worker<QueueJobPayload> {
  return new Worker<QueueJobPayload>(EVENT_QUEUE_NAME, processor, {
    connection,
    concurrency,
  });
}

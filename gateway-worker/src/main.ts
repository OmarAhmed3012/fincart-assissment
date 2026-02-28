import { Queue } from 'bullmq';
import { createLogger } from '@fincart/shared';

import { checkWorkerHealth } from './health/health.js';
import { classifyError } from './processors/error-classifier.js';
import { type RetryPolicyConfig } from './queue/retry-policy.js';
import { createEventJobProcessor } from './queue/worker.js';
import { ActiveShipmentsRepository } from './repositories/active-shipments.repository.js';
import { DeadLetterEventsRepository } from './repositories/dead-letter-events.repository.js';
import { ProcessedEventsRepository } from './repositories/processed-events.repository.js';
import {
  connectMongo,
  createRedisConnection,
  createWorkerQueue,
  loadWorkerEnv,
} from './config/index.js';

const DLQ_QUEUE_NAME = 'courier-events-dlq';
const HEALTH_INTERVAL_MS = 30_000;

function parseRedisOptions(redisUrlRaw: string) {
  const redisUrl = new URL(redisUrlRaw);
  const redisDbPath = redisUrl.pathname.replace('/', '');

  return {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 5000,
    ...(redisUrl.protocol.startsWith('rediss') ? { tls: {} } : {}),
    host: redisUrl.hostname,
    port: Number.parseInt(redisUrl.port || '6379', 10),
    password: redisUrl.password || undefined,
    username: redisUrl.username || undefined,
    db: Number.parseInt(redisDbPath || '0', 10),
  };
}

async function closeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<void> {
  await Promise.race([
    promise.then(() => undefined),
    new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

async function start(): Promise<void> {
  const env = loadWorkerEnv();
  const logger = createLogger({
    serviceName: env.SERVICE_NAME,
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV !== 'production',
  });

  const mongoClient = await connectMongo(env.MONGO_URI);
  const mongoDb = mongoClient.db(env.MONGO_DB_NAME);

  const redisConnection = createRedisConnection(parseRedisOptions(env.REDIS_URL));

  const processedEvents = new ProcessedEventsRepository(mongoDb, logger);
  const activeShipments = new ActiveShipmentsRepository(mongoDb, logger);
  const deadLetters = new DeadLetterEventsRepository(mongoDb, logger);

  const dlqQueue = new Queue(DLQ_QUEUE_NAME, { connection: redisConnection });

  const retryConfig: RetryPolicyConfig = {
    baseMs: env.RETRY_BACKOFF_BASE_MS,
    multiplier: env.RETRY_BACKOFF_MULTIPLIER,
    jitterPercent: env.RETRY_JITTER_PERCENT,
    maxAttempts: env.RETRY_MAX_ATTEMPTS,
  };

  const processor = createEventJobProcessor({
    processedEvents,
    activeShipments,
    deadLetters,
    dlqQueue,
    retryConfig,
    logger,
  });

  const worker = createWorkerQueue(redisConnection, env.WORKER_CONCURRENCY, processor);

  worker.on('failed', (job, error) => {
    const classified = classifyError(error);
    logger.warn(
      {
        eventId: job?.data.eventId,
        idempotencyKey: job?.data.idempotencyKey,
        classification: classified.classification,
        code: classified.code,
      },
      'Job failed',
    );
  });

  worker.on('error', (error) => {
    const classified = classifyError(error);
    logger.error(
      { classification: classified.classification, code: classified.code },
      classified.message,
    );
  });

  const healthTimer = setInterval(() => {
    void checkWorkerHealth({ redis: redisConnection, mongoDb })
      .then((status) => {
        logger.info(status, 'Worker health status');
      })
      .catch((error: unknown) => {
        const classified = classifyError(error);
        logger.warn(
          { classification: classified.classification, code: classified.code },
          classified.message,
        );
      });
  }, HEALTH_INTERVAL_MS);

  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info('Shutdown signal received, stopping worker...');

    clearInterval(healthTimer);

    logger.info('Draining active jobs...');
    await closeWithTimeout(worker.close(), env.WORKER_DRAIN_TIMEOUT_MS);

    logger.info('Worker closed, closing DLQ queue...');
    await dlqQueue.close();

    logger.info('DLQ queue closed, closing Redis...');
    await redisConnection.quit();

    logger.info('Redis closed, closing MongoDB...');
    await mongoClient.close();

    logger.info('All connections closed, exiting.');
  };

  process.once('SIGTERM', () => {
    void shutdown();
  });

  process.once('SIGINT', () => {
    void shutdown();
  });
}

void start();

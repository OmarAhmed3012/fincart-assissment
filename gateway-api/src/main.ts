import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { loadApiEnv } from './config/env.js';
import { connectMongo } from './config/mongo.js';
import { createEventQueue, createRedisConnection } from './config/queue.js';
import { registerHealthRoute } from './health/health.route.js';
import { IngestionRecordRepository } from './repositories/ingestion-record.repository.js';
import { registerIngestionRoutes } from './routes/ingestion.routes.js';

async function start(): Promise<void> {
  const env = loadApiEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  await app.register(fastifyRawBody, {
    field: 'rawBody',
    global: true,
    encoding: false,
    runFirst: true,
  });

  const mongoClient = await connectMongo(env.MONGO_URI);
  const mongoDb = mongoClient.db(env.MONGO_DB_NAME);

  const redisUrl = new URL(env.REDIS_URL);
  const redisDbPath = redisUrl.pathname.replace('/', '');

  const redisConnection = createRedisConnection({
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
  });

  const queue = createEventQueue(redisConnection);
  const repository = new IngestionRecordRepository(mongoDb, app.log);

  await registerHealthRoute(app, {
    redis: redisConnection,
    mongoDb,
  });

  await registerIngestionRoutes(app, {
    queue,
    repository,
    signingSecret: env.SIGNING_SECRET,
    signatureToleranceSeconds: env.SIGNATURE_TOLERANCE_SECONDS,
  });

  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info('Shutdown signal received, stopping server...');

    await app.close();
    app.log.info('Server closed, closing queue...');
    await queue.close();
    app.log.info('Queue closed, closing Redis...');
    await redisConnection.quit();
    app.log.info('Redis closed, closing MongoDB...');
    await mongoClient.close();
    app.log.info('All connections closed, exiting.');
  };

  process.once('SIGTERM', () => {
    void shutdown();
  });

  process.once('SIGINT', () => {
    void shutdown();
  });

  await app.listen({
    host: '0.0.0.0',
    port: env.API_PORT,
  });
}

const isMain =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  start().catch((error: unknown) => {
    process.exitCode = 1;
    throw error;
  });
}

export { start };

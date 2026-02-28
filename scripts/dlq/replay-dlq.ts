import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { MongoClient } from 'mongodb';
import { z } from 'zod';
import { createLogger } from '@fincart/shared';

const envSchema = z.object({
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  MONGO_URI: z.string().url().default('mongodb://localhost:27017'),
  MONGO_DB_NAME: z.string().trim().min(1).default('fincart_gateway'),
});

function parseLimit(argv: string[]): number {
  const index = argv.findIndex((arg) => arg === '--limit');
  if (index === -1) {
    return 10;
  }

  const value = argv[index + 1];
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }

  return parsed;
}

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

async function run(): Promise<void> {
  const env = envSchema.parse(process.env);
  const limit = parseLimit(process.argv.slice(2));
  const logger = createLogger({
    serviceName: 'dlq-replay',
    level: 'info',
    pretty: true,
  });

  const mongoClient = await new MongoClient(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  }).connect();
  const db = mongoClient.db(env.MONGO_DB_NAME);
  const deadLetters = db.collection('dead_letter_events');

  const redis = new Redis(parseRedisOptions(env.REDIS_URL));
  const mainQueue = new Queue('courier-events-main', { connection: redis });

  try {
    const records = await deadLetters
      .find({ reviewStatus: 'pending' })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();

    for (const record of records) {
      await mainQueue.add('courier-event', {
        eventId: record.eventId,
        eventType: record.eventType,
        occurredAt: record.payloadSnapshot?.occurredAt ?? new Date().toISOString(),
        source: record.payloadSnapshot?.source ?? 'dlq-replay',
        signatureMeta: record.payloadSnapshot?.signatureMeta ?? {
          algorithm: 'sha256',
          timestamp: Math.floor(Date.now() / 1000),
          signatureHeader: 'replayed',
        },
        idempotencyKey: record.idempotencyKey,
        traceId: record.traceId ?? `dlq-${record.eventId}`,
        attempt: 1,
        payload: record.payloadSnapshot ?? {},
        receivedAt: new Date().toISOString(),
      });

      await deadLetters.updateOne(
        { _id: record._id },
        {
          $set: {
            reviewStatus: 'replayed',
          },
        },
      );
    }

    logger.info({ count: records.length }, 'DLQ replay completed');
  } finally {
    await mainQueue.close();
    await redis.quit();
    await mongoClient.close();
  }
}

run().catch((error: unknown) => {
  const logger = createLogger({
    serviceName: 'dlq-replay',
    level: 'error',
    pretty: true,
  });
  logger.error({ err: error }, 'DLQ replay failed');
  process.exitCode = 1;
});

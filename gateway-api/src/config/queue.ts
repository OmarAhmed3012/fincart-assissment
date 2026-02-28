import { Redis, type RedisOptions } from 'ioredis';
import { Queue } from 'bullmq';

const EVENT_QUEUE_NAME = 'courier-events-main';

export function createRedisConnection(opts: RedisOptions): Redis {
  const connection = new Redis(opts);
  return connection;
}

export function createEventQueue(connection: Redis): Queue {
  return new Queue(EVENT_QUEUE_NAME, { connection });
}

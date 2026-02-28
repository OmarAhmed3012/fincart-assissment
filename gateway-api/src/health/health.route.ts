import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface RedisHealthClient {
  ping(): Promise<string>;
}

interface MongoHealthDb {
  command(command: { ping: 1 }): Promise<{ ok?: number }>;
}

interface RegisterHealthRouteOptions {
  redis: RedisHealthClient;
  mongoDb: MongoHealthDb;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  redis: 'connected' | 'disconnected';
  mongo: 'connected' | 'disconnected';
  timestamp: string;
}

export async function registerHealthRoute(
  app: FastifyInstance,
  options: RegisterHealthRouteOptions,
): Promise<void> {
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    let redisStatus: HealthResponse['redis'] = 'disconnected';
    let mongoStatus: HealthResponse['mongo'] = 'disconnected';

    try {
      const pingResult = await options.redis.ping();
      if (pingResult.toUpperCase() === 'PONG') {
        redisStatus = 'connected';
      }
    } catch {
      redisStatus = 'disconnected';
    }

    try {
      const mongoPingResult = await options.mongoDb.command({ ping: 1 });
      if (mongoPingResult.ok === 1) {
        mongoStatus = 'connected';
      }
    } catch {
      mongoStatus = 'disconnected';
    }

    const status: HealthResponse['status'] =
      redisStatus === 'connected' && mongoStatus === 'connected' ? 'healthy' : 'unhealthy';

    const responseBody: HealthResponse = {
      status,
      redis: redisStatus,
      mongo: mongoStatus,
      timestamp: new Date().toISOString(),
    };

    if (status === 'healthy') {
      return reply.status(200).send(responseBody);
    }

    return reply.status(503).send(responseBody);
  });
}

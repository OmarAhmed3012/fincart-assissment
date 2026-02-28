interface HealthDeps {
  redis: {
    ping(): Promise<string>;
  };
  mongoDb: {
    command(command: { ping: 1 }): Promise<{ ok?: number }>;
  };
}

export interface WorkerHealthStatus {
  status: 'healthy' | 'unhealthy';
  redis: 'connected' | 'disconnected';
  mongo: 'connected' | 'disconnected';
  timestamp: string;
}

export async function checkWorkerHealth(deps: HealthDeps): Promise<WorkerHealthStatus> {
  let redis: WorkerHealthStatus['redis'] = 'disconnected';
  let mongo: WorkerHealthStatus['mongo'] = 'disconnected';

  try {
    const result = await deps.redis.ping();
    if (result.toUpperCase() === 'PONG') {
      redis = 'connected';
    }
  } catch {
    redis = 'disconnected';
  }

  try {
    const result = await deps.mongoDb.command({ ping: 1 });
    if (result.ok === 1) {
      mongo = 'connected';
    }
  } catch {
    mongo = 'disconnected';
  }

  return {
    status: redis === 'connected' && mongo === 'connected' ? 'healthy' : 'unhealthy',
    redis,
    mongo,
    timestamp: new Date().toISOString(),
  };
}

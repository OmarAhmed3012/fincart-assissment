import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const workerEnvSchema = z.object({
  SERVICE_NAME: z.string().trim().min(1).default('gateway-worker'),
  NODE_ENV: nodeEnvSchema.default('development'),
  LOG_LEVEL: logLevelSchema.default('info'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  MONGO_URI: z.string().url().default('mongodb://localhost:27017'),
  MONGO_DB_NAME: z.string().trim().min(1).default('fincart_gateway'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(10),
  WORKER_DRAIN_TIMEOUT_MS: z.coerce.number().int().min(1).default(15000),
  RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  RETRY_BACKOFF_BASE_MS: z.coerce.number().int().min(1).default(1000),
  RETRY_BACKOFF_MULTIPLIER: z.coerce.number().positive().default(2),
  RETRY_JITTER_PERCENT: z.coerce.number().min(0).max(100).default(20),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'env';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

export function loadWorkerEnv(): WorkerEnv {
  const parsed = workerEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid gateway-worker environment variables: ${formatIssues(parsed.error)}`);
  }

  return parsed.data;
}

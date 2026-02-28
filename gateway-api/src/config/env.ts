import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const apiEnvSchema = z.object({
  SERVICE_NAME: z.string().trim().min(1).default('gateway-api'),
  NODE_ENV: nodeEnvSchema.default('development'),
  LOG_LEVEL: logLevelSchema.default('info'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SIGNING_SECRET: z.string().trim().min(1, 'SIGNING_SECRET is required and must be non-empty'),
  SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().min(1).default(300),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  MONGO_URI: z.string().url().default('mongodb://localhost:27017'),
  MONGO_DB_NAME: z.string().trim().min(1).default('fincart_gateway'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'env';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

export function loadApiEnv(): ApiEnv {
  const parsed = apiEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid gateway-api environment variables: ${formatIssues(parsed.error)}`);
  }

  return parsed.data;
}

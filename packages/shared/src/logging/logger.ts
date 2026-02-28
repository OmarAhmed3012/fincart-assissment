import pino from 'pino';

export interface CreateLoggerOptions {
  serviceName: string;
  level: string;
  pretty?: boolean;
}

export interface CorrelationFields {
  traceId?: string;
  requestId?: string;
}

function normalizeField(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createLogger(opts: CreateLoggerOptions): pino.Logger {
  const baseOptions: pino.LoggerOptions = {
    name: opts.serviceName,
    level: opts.level,
    base: {
      service: opts.serviceName,
    },
  };

  if (opts.pretty) {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          singleLine: true,
        },
      },
    });
  }

  return pino(baseOptions);
}

export function withCorrelation(logger: pino.Logger, fields: CorrelationFields): pino.Logger {
  const traceId = normalizeField(fields.traceId);
  const requestId = normalizeField(fields.requestId);

  const childBindings: { traceId?: string; requestId?: string } = {};

  if (traceId) {
    childBindings.traceId = traceId;
  }

  if (requestId) {
    childBindings.requestId = requestId;
  }

  return logger.child(childBindings);
}

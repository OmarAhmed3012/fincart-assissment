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
export declare function createLogger(opts: CreateLoggerOptions): pino.Logger;
export declare function withCorrelation(logger: pino.Logger, fields: CorrelationFields): pino.Logger;
//# sourceMappingURL=logger.d.ts.map
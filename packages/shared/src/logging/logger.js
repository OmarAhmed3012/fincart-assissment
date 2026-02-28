import pino from 'pino';
function normalizeField(value) {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function createLogger(opts) {
    const baseOptions = {
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
export function withCorrelation(logger, fields) {
    const traceId = normalizeField(fields.traceId);
    const requestId = normalizeField(fields.requestId);
    const childBindings = {};
    if (traceId) {
        childBindings.traceId = traceId;
    }
    if (requestId) {
        childBindings.requestId = requestId;
    }
    return logger.child(childBindings);
}
//# sourceMappingURL=logger.js.map
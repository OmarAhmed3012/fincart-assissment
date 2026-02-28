export type ErrorCode = 'INVALID_SIGNATURE' | 'INVALID_PAYLOAD' | 'INTAKE_UNAVAILABLE' | 'TRANSIENT_DEPENDENCY_FAILURE' | 'PERMANENT_FAILURE' | 'DLQ_EXHAUSTED' | 'RETRY_LIMIT_EXCEEDED' | 'IDEMPOTENCY_CONFLICT' | 'UNKNOWN_ERROR';
export type ErrorClassification = 'transient' | 'permanent';
export interface AppError {
    code: ErrorCode;
    message: string;
    classification?: ErrorClassification;
    cause?: unknown;
    meta?: Record<string, unknown>;
}
//# sourceMappingURL=error-contract.d.ts.map
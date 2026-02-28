import type { ErrorClassification, ErrorCode } from '@fincart/shared';

export interface ClassifiedError {
  classification: ErrorClassification;
  code: ErrorCode;
  message: string;
}

interface ErrorLike {
  code?: string;
  name?: string;
  message?: string;
}

function asErrorLike(error: unknown): ErrorLike {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;

    return {
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      name: typeof candidate.name === 'string' ? candidate.name : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return {};
}

export function classifyError(error: unknown): ClassifiedError {
  const parsed = asErrorLike(error);
  const message = parsed.message ?? 'Unknown error';
  const lowerMessage = message.toLowerCase();

  if (
    parsed.code === 'ECONNREFUSED' ||
    parsed.code === 'ETIMEDOUT' ||
    (parsed.name ?? '').includes('Timeout')
  ) {
    return {
      classification: 'transient',
      code: 'TRANSIENT_DEPENDENCY_FAILURE',
      message,
    };
  }

  if (
    lowerMessage.includes('validation') ||
    lowerMessage.includes('malformed') ||
    lowerMessage.includes('invalid')
  ) {
    return {
      classification: 'permanent',
      code: 'PERMANENT_FAILURE',
      message,
    };
  }

  return {
    classification: 'transient',
    code: 'UNKNOWN_ERROR',
    message,
  };
}

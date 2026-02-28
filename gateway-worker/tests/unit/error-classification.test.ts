import { describe, expect, it } from 'vitest';

import { classifyError } from '../../src/processors/error-classifier.js';

describe('error classifier', () => {
  it('classifies timeout/network errors as transient', () => {
    const timeoutError = { code: 'ETIMEDOUT', message: 'request timeout' };
    const result = classifyError(timeoutError);

    expect(result.classification).toBe('transient');
    expect(result.code).toBe('TRANSIENT_DEPENDENCY_FAILURE');
  });

  it('classifies malformed payload errors as permanent', () => {
    const error = new Error('Invalid malformed payload for shipment');
    const result = classifyError(error);

    expect(result.classification).toBe('permanent');
    expect(result.code).toBe('PERMANENT_FAILURE');
  });

  it('classifies unknown errors as transient by default', () => {
    const result = classifyError({ foo: 'bar' });

    expect(result.classification).toBe('transient');
    expect(result.code).toBe('UNKNOWN_ERROR');
  });
});

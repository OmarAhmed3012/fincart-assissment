import { describe, expect, it } from 'vitest';

import { calculateBackoffDelay } from '../../src/queue/retry-policy.js';

describe('retry policy integration', () => {
  it('calculates expected delays and jitter bounds', () => {
    const config = {
      baseMs: 1000,
      multiplier: 2,
      jitterPercent: 20,
      maxAttempts: 5,
    };

    const attempt1 = calculateBackoffDelay(1, config, 0);
    const attempt2 = calculateBackoffDelay(2, config, 0);
    const attempt3Low = calculateBackoffDelay(3, config, 0);
    const attempt3High = calculateBackoffDelay(3, config, 1);

    expect(attempt1).toBe(1000);
    expect(attempt2).toBe(2000);
    expect(attempt3Low).toBe(4000);
    expect(attempt3High).toBeLessThanOrEqual(4800);
    expect(attempt3High).toBeGreaterThanOrEqual(4000);
  });

  it('returns null at max attempts boundary overflow', () => {
    const config = {
      baseMs: 1000,
      multiplier: 2,
      jitterPercent: 20,
      maxAttempts: 5,
    };

    expect(calculateBackoffDelay(6, config, 0.5)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { calculateBackoffDelay } from '../../src/queue/retry-policy.js';

const config = {
  baseMs: 1000,
  multiplier: 2,
  jitterPercent: 20,
  maxAttempts: 5,
};

describe('retry policy unit', () => {
  it('calculates exponential delays for attempts 1 to 5', () => {
    expect(calculateBackoffDelay(1, config, 0)).toBe(1000);
    expect(calculateBackoffDelay(2, config, 0)).toBe(2000);
    expect(calculateBackoffDelay(3, config, 0)).toBe(4000);
    expect(calculateBackoffDelay(4, config, 0)).toBe(8000);
    expect(calculateBackoffDelay(5, config, 0)).toBe(16000);
  });

  it('keeps jitter within 0-20 percent bounds', () => {
    const attemptThreeBase = 4000;
    const low = calculateBackoffDelay(3, config, 0) ?? 0;
    const high = calculateBackoffDelay(3, config, 1) ?? 0;

    expect(low).toBeGreaterThanOrEqual(attemptThreeBase);
    expect(high).toBeLessThanOrEqual(attemptThreeBase * 1.2);
  });

  it('never returns negative delay', () => {
    const value = calculateBackoffDelay(1, config, 0);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it('returns null when attempts are exhausted', () => {
    expect(calculateBackoffDelay(6, config, 0.5)).toBeNull();
  });
});

import type { ErrorClassification } from '@fincart/shared';

export interface RetryPolicyConfig {
  baseMs: number;
  multiplier: number;
  jitterPercent: number;
  maxAttempts: number;
}

export function calculateBackoffDelay(
  attempt: number,
  config: RetryPolicyConfig,
  randomFactor?: number,
): number | null {
  if (attempt > config.maxAttempts) {
    return null;
  }

  const effectiveAttempt = Math.max(1, attempt);
  const baseDelay = config.baseMs * Math.pow(config.multiplier, effectiveAttempt - 1);
  const boundedRandom = Math.min(1, Math.max(0, randomFactor ?? Math.random()));
  const jitter = baseDelay * (config.jitterPercent / 100) * boundedRandom;
  const total = Math.round(baseDelay + jitter);

  return Math.max(0, total);
}

export function shouldRetry(
  attempt: number,
  maxAttempts: number,
  classification: ErrorClassification,
): boolean {
  if (classification === 'permanent') {
    return false;
  }

  return attempt < maxAttempts;
}

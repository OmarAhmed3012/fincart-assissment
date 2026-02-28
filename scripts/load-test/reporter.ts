export interface LoadTestRawResults {
  timestamp: string;
  config: {
    targetUrl: string;
    concurrency: number;
    totalRequests: number;
    duplicatePercent: number;
  };
  counts: {
    totalSent: number;
    accepted202: number;
    badRequest400: number;
    unauthorized401: number;
    serviceUnavailable503: number;
    networkErrors: number;
    duplicatesInjected: number;
  };
  latenciesMs: number[];
  duplicateOutcomes: {
    duplicateAttempts: number;
    duplicateAccepted: number;
    duplicateRejected: number;
  };
  retryOutcomes: {
    totalRetryEligible: number;
    recovered: number;
  };
}

export interface LoadTestReport {
  timestamp: string;
  config: {
    targetUrl: string;
    concurrency: number;
    totalRequests: number;
    duplicatePercent: number;
  };
  summary: {
    totalSent: number;
    accepted: number;
    rejected: number;
    serviceUnavailable: number;
    networkErrors: number;
    duplicatesInjected: number;
    acceptRate: string;
  };
  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  successCriteria: {
    sc001: { passed: boolean; detail: string };
    sc002: { passed: boolean; detail: string };
    sc003: { passed: boolean; detail: string };
    sc004: { passed: boolean; detail: string };
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function generateReport(results: LoadTestRawResults): LoadTestReport {
  const sorted = [...results.latenciesMs].sort((a, b) => a - b);
  const total = Math.max(1, results.counts.totalSent);
  const acceptRate = results.counts.accepted202 / total;
  const rejected = results.counts.badRequest400 + results.counts.unauthorized401;
  const min = sorted.length > 0 ? sorted[0] : 0;
  const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
  const mean =
    sorted.length > 0 ? sorted.reduce((acc, value) => acc + value, 0) / sorted.length : 0;

  const p95 = percentile(sorted, 95);

  const sc001Pass = acceptRate >= 0.99 && p95 <= 2000;
  const sc003Pass =
    results.counts.duplicatesInjected > 0 &&
    results.duplicateOutcomes.duplicateAccepted <= results.duplicateOutcomes.duplicateAttempts;
  const sc004Pass =
    results.retryOutcomes.totalRetryEligible === 0 ||
    results.retryOutcomes.recovered / results.retryOutcomes.totalRetryEligible >= 0.95;

  return {
    timestamp: results.timestamp,
    config: results.config,
    summary: {
      totalSent: results.counts.totalSent,
      accepted: results.counts.accepted202,
      rejected,
      serviceUnavailable: results.counts.serviceUnavailable503,
      networkErrors: results.counts.networkErrors,
      duplicatesInjected: results.counts.duplicatesInjected,
      acceptRate: formatPercent(acceptRate),
    },
    latency: {
      min,
      max,
      mean: Number(mean.toFixed(2)),
      p50: percentile(sorted, 50),
      p95,
      p99: percentile(sorted, 99),
    },
    successCriteria: {
      sc001: {
        passed: sc001Pass,
        detail: `acceptRate=${formatPercent(acceptRate)}, p95=${p95}ms`,
      },
      sc002: {
        passed: false,
        detail: 'Requires MongoDB check — pending assertion step',
      },
      sc003: {
        passed: sc003Pass,
        detail: `duplicatesInjected=${results.counts.duplicatesInjected}, duplicateAccepted=${results.duplicateOutcomes.duplicateAccepted}`,
      },
      sc004: {
        passed: sc004Pass,
        detail:
          results.retryOutcomes.totalRetryEligible === 0
            ? 'No retry-eligible failures observed'
            : `recovered=${results.retryOutcomes.recovered}/${results.retryOutcomes.totalRetryEligible}`,
      },
    },
  };
}

export function printReport(report: LoadTestReport): void {
  console.log('\n=== Load Test Summary ===');
  console.table({
    targetUrl: report.config.targetUrl,
    concurrency: report.config.concurrency,
    totalRequests: report.config.totalRequests,
    duplicates: report.config.duplicatePercent,
    accepted: report.summary.accepted,
    rejected: report.summary.rejected,
    serviceUnavailable: report.summary.serviceUnavailable,
    networkErrors: report.summary.networkErrors,
    acceptRate: report.summary.acceptRate,
  });

  console.log('\n=== Latency (ms) ===');
  console.table(report.latency);

  console.log('\n=== Success Criteria ===');
  console.table({
    SC001: report.successCriteria.sc001,
    SC002: report.successCriteria.sc002,
    SC003: report.successCriteria.sc003,
    SC004: report.successCriteria.sc004,
  });
}

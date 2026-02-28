import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assertThresholds } from './assert-thresholds.ts';
import { generateReport, printReport, type LoadTestRawResults } from './reporter.ts';
import { generateSignedEvent } from '../signing/generate-signed-event.ts';

interface LoadTestConfig {
  targetUrl: string;
  concurrency: number;
  totalRequests: number;
  duplicatePercent: number;
  signingSecret: string;
}

interface PreparedEvent {
  body: string;
  headers: Record<string, string>;
  idempotencyKey: string;
  isDuplicate: boolean;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadConfig(): LoadTestConfig {
  const signingSecret = process.env.SIGNING_SECRET;

  if (!signingSecret || signingSecret.trim().length === 0) {
    throw new Error('SIGNING_SECRET is required');
  }

  return {
    targetUrl: process.env.LOADTEST_TARGET_URL ?? 'http://localhost:3000/v1/events/courier',
    concurrency: parseNumber(process.env.LOADTEST_CONCURRENCY, 100),
    totalRequests: parseNumber(process.env.LOADTEST_TOTAL_REQUESTS, 1000),
    duplicatePercent: Math.min(100, parseNumber(process.env.LOADTEST_DUPLICATE_PERCENT, 10)),
    signingSecret,
  };
}

function buildEvents(config: LoadTestConfig): PreparedEvent[] {
  const events: PreparedEvent[] = [];

  for (let i = 0; i < config.totalRequests; i += 1) {
    const generated = generateSignedEvent({
      signingSecret: config.signingSecret,
    });
    const parsedBody = JSON.parse(generated.body) as { idempotencyKey: string };

    events.push({
      body: generated.body,
      headers: generated.headers,
      idempotencyKey: parsedBody.idempotencyKey,
      isDuplicate: false,
    });
  }

  const duplicateCount = Math.floor((config.totalRequests * config.duplicatePercent) / 100);
  const sourcePoolSize = Math.max(1, Math.floor(config.totalRequests * 0.5));

  for (let i = 0; i < duplicateCount; i += 1) {
    const targetIndex = sourcePoolSize + i;
    if (targetIndex >= events.length) {
      break;
    }

    const sourceIndex = Math.floor(Math.random() * sourcePoolSize);
    const sourceIdempotencyKey = events[sourceIndex].idempotencyKey;

    const duplicate = generateSignedEvent({
      signingSecret: config.signingSecret,
      idempotencyKey: sourceIdempotencyKey,
    });

    events[targetIndex] = {
      body: duplicate.body,
      headers: duplicate.headers,
      idempotencyKey: sourceIdempotencyKey,
      isDuplicate: true,
    };
  }

  return events;
}

async function runConcurrencyPool<T>(
  items: T[],
  maxConcurrent: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  async function consume(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.max(1, maxConcurrent) }, () => consume());
  await Promise.all(workers);
}

async function run(): Promise<void> {
  const config = loadConfig();
  const events = buildEvents(config);

  const counts = {
    totalSent: 0,
    accepted202: 0,
    badRequest400: 0,
    unauthorized401: 0,
    serviceUnavailable503: 0,
    networkErrors: 0,
    duplicatesInjected: events.filter((event) => event.isDuplicate).length,
  };

  const duplicateOutcomes = {
    duplicateAttempts: events.filter((event) => event.isDuplicate).length,
    duplicateAccepted: 0,
    duplicateRejected: 0,
  };

  const retryOutcomes = {
    totalRetryEligible: 0,
    recovered: 0,
  };

  const latenciesMs: number[] = [];

  await runConcurrencyPool(events, config.concurrency, async (event) => {
    const startedAt = Date.now();

    try {
      const response = await fetch(config.targetUrl, {
        method: 'POST',
        headers: event.headers,
        body: event.body,
      });

      counts.totalSent += 1;
      const latency = Date.now() - startedAt;
      latenciesMs.push(latency);

      if (response.status === 202) {
        counts.accepted202 += 1;
        if (event.isDuplicate) {
          duplicateOutcomes.duplicateAccepted += 1;
        }
      } else if (response.status === 400) {
        counts.badRequest400 += 1;
        if (event.isDuplicate) {
          duplicateOutcomes.duplicateRejected += 1;
        }
      } else if (response.status === 401) {
        counts.unauthorized401 += 1;
        if (event.isDuplicate) {
          duplicateOutcomes.duplicateRejected += 1;
        }
      } else if (response.status === 503) {
        counts.serviceUnavailable503 += 1;
      }
    } catch {
      counts.totalSent += 1;
      counts.networkErrors += 1;
      latenciesMs.push(Date.now() - startedAt);
    }
  });

  const results: LoadTestRawResults = {
    timestamp: new Date().toISOString(),
    config: {
      targetUrl: config.targetUrl,
      concurrency: config.concurrency,
      totalRequests: config.totalRequests,
      duplicatePercent: config.duplicatePercent,
    },
    counts,
    latenciesMs,
    duplicateOutcomes,
    retryOutcomes,
  };

  const report = generateReport(results);
  printReport(report);

  const threshold = await assertThresholds(
    report,
    process.env.MONGO_URI,
    process.env.MONGO_DB_NAME,
  );

  console.log('\n=== Threshold Result ===');
  console.table(threshold.results);
  console.log(`allPassed=${threshold.allPassed}`);

  const resultsDir = join(process.cwd(), 'scripts', 'load-test', 'results');
  await mkdir(resultsDir, { recursive: true });
  const timestampSlug = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = join(resultsDir, `results-${timestampSlug}.json`);
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        raw: results,
        report,
        threshold,
      },
      null,
      2,
    ),
    'utf-8',
  );
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

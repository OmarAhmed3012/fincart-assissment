import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

import type { LoadTestReport } from './reporter.ts';

const execFileAsync = promisify(execFile);

interface CriterionResult {
  passed: boolean;
  detail: string;
}

interface AssertionResult {
  allPassed: boolean;
  results: {
    sc001: CriterionResult;
    sc002: CriterionResult;
    sc003: CriterionResult;
    sc004: CriterionResult;
  };
}

interface MongoStats {
  totalTracked: number;
  terminalTracked: number;
  duplicateIdempotencyKeys: number;
  retryEligible: number;
  recovered: number;
}

async function tryReadMongoStats(
  mongoUri: string,
  mongoDbName: string,
): Promise<MongoStats | null> {
  let client: MongoClient | null = null;

  try {
    client = new MongoClient(mongoUri);
    await client.connect();

    const db = client.db(mongoDbName);
    const collection = db.collection('processed_events');

    const totalTracked = await collection.countDocuments({});

    const terminalTracked = await collection.countDocuments({
      status: { $in: ['processed', 'dead_lettered'] },
    });

    const duplicateAggregation = await collection
      .aggregate([
        { $group: { _id: '$idempotencyKey', c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } },
        { $count: 'duplicates' },
      ])
      .toArray();

    const duplicateIdempotencyKeys =
      (duplicateAggregation[0] as { duplicates?: number } | undefined)?.duplicates ?? 0;

    const retryEligible = await collection.countDocuments({
      attemptCount: { $gt: 1 },
    });

    const recovered = await collection.countDocuments({
      status: 'processed',
      attemptCount: { $gt: 1 },
    });

    return {
      totalTracked,
      terminalTracked,
      duplicateIdempotencyKeys,
      retryEligible,
      recovered,
    };
  } catch {
    return null;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

export async function assertThresholds(
  report: LoadTestReport,
  mongoUri?: string,
  mongoDbName?: string,
): Promise<AssertionResult> {
  const sc001: CriterionResult = {
    passed:
      report.summary.totalSent > 0 &&
      report.summary.accepted / report.summary.totalSent >= 0.99 &&
      report.latency.p95 <= 2000,
    detail: `accepted=${report.summary.accepted}/${report.summary.totalSent}, p95=${report.latency.p95}ms`,
  };

  let sc002: CriterionResult = {
    passed: false,
    detail: 'Requires MongoDB check — skipped',
  };
  let sc003: CriterionResult = {
    passed: false,
    detail: 'Requires MongoDB check — skipped',
  };
  let sc004: CriterionResult = {
    passed: false,
    detail: 'Requires MongoDB check — skipped',
  };

  if (mongoUri && mongoDbName) {
    const stats = await tryReadMongoStats(mongoUri, mongoDbName);

    if (stats) {
      sc002 = {
        passed: stats.totalTracked > 0 && stats.terminalTracked === stats.totalTracked,
        detail: `terminalTracked=${stats.terminalTracked}, totalTracked=${stats.totalTracked}`,
      };

      sc003 = {
        passed: stats.duplicateIdempotencyKeys === 0,
        detail: `duplicateIdempotencyKeys=${stats.duplicateIdempotencyKeys}`,
      };

      sc004 = {
        passed: stats.retryEligible === 0 || stats.recovered / stats.retryEligible >= 0.95,
        detail:
          stats.retryEligible === 0
            ? 'No retry-eligible records'
            : `recovered=${stats.recovered}/${stats.retryEligible}`,
      };
    }
  }

  const allPassed = sc001.passed && sc002.passed && sc003.passed && sc004.passed;

  return {
    allPassed,
    results: { sc001, sc002, sc003, sc004 },
  };
}

async function readLatestReport(): Promise<LoadTestReport> {
  const resultsDir = join(process.cwd(), 'scripts', 'load-test', 'results');
  const entries = await readdir(resultsDir, { withFileTypes: true });
  const resultFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  if (resultFiles.length === 0) {
    throw new Error('No load test result files found in scripts/load-test/results/');
  }

  const latestFile = resultFiles[resultFiles.length - 1];
  const content = await readFile(join(resultsDir, latestFile), 'utf-8');
  const parsed = JSON.parse(content) as { report?: LoadTestReport } | LoadTestReport;
  return 'report' in parsed && parsed.report ? parsed.report : (parsed as LoadTestReport);
}

const isMain = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');

if (isMain) {
  const mongoUri = process.env.MONGO_URI;
  const mongoDbName = process.env.MONGO_DB_NAME;

  readLatestReport()
    .then(async (report) => {
      const assertion = await assertThresholds(report, mongoUri, mongoDbName);

      console.log('\n=== Threshold Assertions ===');
      console.table(assertion.results);
      console.log(`allPassed=${assertion.allPassed}`);

      if (!assertion.allPassed) {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}

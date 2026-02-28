import type { Collection, Db, WithId } from 'mongodb';
import type { Logger } from 'pino';

type ProcessedStatus = 'received' | 'processing' | 'processed' | 'failed' | 'dead_lettered';

export interface ProcessedEventRecord {
  idempotencyKey: string;
  eventId: string;
  eventType: string;
  status: ProcessedStatus;
  attemptCount: number;
  attemptHistory: Array<{
    attempt: number;
    errorCode: string;
    message: string;
    timestamp: string;
  }>;
  firstSeenAt: string;
  updatedAt: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  expiresAt?: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isoNow(): string {
  return new Date().toISOString();
}

function terminalExpiry(daysMs: number): string {
  return new Date(Date.now() + daysMs).toISOString();
}

export class ProcessedEventsRepository {
  private readonly collection: Collection<ProcessedEventRecord>;

  public constructor(
    db: Db,
    private readonly logger: Logger,
  ) {
    this.collection = db.collection<ProcessedEventRecord>('processed_events');
  }

  public async findByIdempotencyKey(key: string): Promise<WithId<ProcessedEventRecord> | null> {
    return this.collection.findOne({ idempotencyKey: key });
  }

  public async markReceived(record: {
    idempotencyKey: string;
    eventId: string;
    eventType: string;
  }): Promise<void> {
    const now = isoNow();

    try {
      await this.collection.findOneAndUpdate(
        { idempotencyKey: record.idempotencyKey },
        {
          $setOnInsert: {
            ...record,
            status: 'received',
            attemptCount: 0,
            attemptHistory: [],
            firstSeenAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      this.logger.warn(
        { err: error, idempotencyKey: record.idempotencyKey },
        'markReceived failed',
      );
      throw error;
    }
  }

  public async markProcessing(
    idempotencyKey: string,
  ): Promise<WithId<ProcessedEventRecord> | null> {
    const now = isoNow();

    try {
      return this.collection.findOneAndUpdate(
        {
          idempotencyKey,
          status: { $in: ['received', 'failed'] },
        },
        {
          $set: {
            status: 'processing',
            updatedAt: now,
          },
          $inc: {
            attemptCount: 1,
          },
        },
        { returnDocument: 'after' },
      );
    } catch (error) {
      this.logger.warn({ err: error, idempotencyKey }, 'markProcessing failed');
      throw error;
    }
  }

  public async markProcessed(idempotencyKey: string): Promise<void> {
    const now = isoNow();

    try {
      await this.collection.findOneAndUpdate(
        { idempotencyKey },
        {
          $set: {
            status: 'processed',
            updatedAt: now,
            expiresAt: terminalExpiry(THIRTY_DAYS_MS),
          },
        },
      );
    } catch (error) {
      this.logger.warn({ err: error, idempotencyKey }, 'markProcessed failed');
      throw error;
    }
  }

  public async markFailed(
    idempotencyKey: string,
    errorCode: string,
    errorMessage: string,
    attemptCount: number,
  ): Promise<void> {
    const now = isoNow();

    try {
      await this.collection.findOneAndUpdate(
        { idempotencyKey },
        {
          $set: {
            status: 'failed',
            lastErrorCode: errorCode,
            lastErrorMessage: errorMessage,
            updatedAt: now,
          },
          $push: {
            attemptHistory: {
              attempt: attemptCount,
              errorCode,
              message: errorMessage,
              timestamp: now,
            },
          },
        },
      );
    } catch (error) {
      this.logger.warn({ err: error, idempotencyKey }, 'markFailed failed');
      throw error;
    }
  }

  public async markDeadLettered(idempotencyKey: string): Promise<void> {
    const now = isoNow();

    try {
      await this.collection.findOneAndUpdate(
        { idempotencyKey },
        {
          $set: {
            status: 'dead_lettered',
            updatedAt: now,
            expiresAt: terminalExpiry(THIRTY_DAYS_MS),
          },
        },
      );
    } catch (error) {
      this.logger.warn({ err: error, idempotencyKey }, 'markDeadLettered failed');
      throw error;
    }
  }
}

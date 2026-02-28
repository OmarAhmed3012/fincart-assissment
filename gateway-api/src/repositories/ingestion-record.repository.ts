import type { Collection, Db, Document, ObjectId } from 'mongodb';

interface LoggerLike {
  warn(object: Record<string, unknown>, message: string): void;
}

type IngestionOutcome = 'accepted' | 'rejected' | 'enqueue_failed';

interface IngestionRecord extends Document {
  _id?: ObjectId;
  traceId: string;
  eventId?: string;
  idempotencyKey?: string;
  source?: string;
  outcome: IngestionOutcome;
  reason?: string;
  createdAt: string;
}

export class IngestionRecordRepository {
  private readonly collection: Collection<IngestionRecord>;

  public constructor(
    db: Db,
    private readonly logger: LoggerLike,
  ) {
    this.collection = db.collection<IngestionRecord>('ingestion_records');
  }

  public async recordAccepted(record: {
    traceId: string;
    eventId: string;
    idempotencyKey: string;
    source: string;
    createdAt: string;
  }): Promise<void> {
    await this.safeInsert({
      ...record,
      outcome: 'accepted',
    });
  }

  public async recordRejected(record: {
    traceId: string;
    reason: string;
    createdAt: string;
    eventId?: string;
    idempotencyKey?: string;
    source?: string;
  }): Promise<void> {
    await this.safeInsert({
      ...record,
      outcome: 'rejected',
    });
  }

  public async recordEnqueueFailure(record: {
    traceId: string;
    eventId: string;
    idempotencyKey: string;
    source: string;
    reason: string;
    createdAt: string;
  }): Promise<void> {
    await this.safeInsert({
      ...record,
      outcome: 'enqueue_failed',
    });
  }

  private async safeInsert(record: IngestionRecord): Promise<void> {
    try {
      await this.collection.insertOne(record);
    } catch (error) {
      this.logger.warn(
        {
          err: error,
          traceId: record.traceId,
          outcome: record.outcome,
        },
        'Failed to persist ingestion audit record',
      );
    }
  }
}

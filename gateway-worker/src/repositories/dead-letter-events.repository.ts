import type { Collection, Db, Document, WithId } from 'mongodb';
import type { Logger } from 'pino';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export interface DeadLetterAttempt {
  attempt: number;
  errorCode: string;
  message: string;
  timestamp: string;
}

export interface DeadLetterEventRecord extends Document {
  eventId: string;
  idempotencyKey: string;
  eventType: string;
  terminalReasonCode: string;
  terminalReasonMessage: string;
  attemptCount: number;
  attemptHistory: DeadLetterAttempt[];
  payloadSnapshot: Record<string, unknown>;
  reviewStatus: 'pending' | 'reviewed' | 'replayed' | 'closed';
  createdAt: string;
  expiresAt: string;
  traceId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function expiryIso(): string {
  return new Date(Date.now() + NINETY_DAYS_MS).toISOString();
}

export class DeadLetterEventsRepository {
  private readonly collection: Collection<DeadLetterEventRecord>;

  public constructor(
    db: Db,
    private readonly logger: Logger,
  ) {
    this.collection = db.collection<DeadLetterEventRecord>('dead_letter_events');
  }

  public async persistDeadLetter(record: {
    eventId: string;
    idempotencyKey: string;
    eventType: string;
    terminalReasonCode: string;
    terminalReasonMessage: string;
    attemptCount: number;
    attemptHistory: DeadLetterAttempt[];
    payloadSnapshot: Record<string, unknown>;
    traceId: string;
  }): Promise<void> {
    try {
      await this.collection.insertOne({
        ...record,
        reviewStatus: 'pending',
        createdAt: nowIso(),
        expiresAt: expiryIso(),
      });
    } catch (error) {
      this.logger.warn({ err: error, eventId: record.eventId }, 'persistDeadLetter failed');
      throw error;
    }
  }

  public async findPendingReview(): Promise<Array<WithId<DeadLetterEventRecord>>> {
    return this.collection.find({ reviewStatus: 'pending' }).sort({ createdAt: 1 }).toArray();
  }

  public async markReviewed(eventId: string): Promise<void> {
    try {
      await this.collection.findOneAndUpdate(
        { eventId },
        {
          $set: {
            reviewStatus: 'reviewed',
          },
        },
      );
    } catch (error) {
      this.logger.warn({ err: error, eventId }, 'markReviewed failed');
      throw error;
    }
  }

  public async markReplayed(eventId: string): Promise<void> {
    try {
      await this.collection.findOneAndUpdate(
        { eventId },
        {
          $set: {
            reviewStatus: 'replayed',
          },
        },
      );
    } catch (error) {
      this.logger.warn({ err: error, eventId }, 'markReplayed failed');
      throw error;
    }
  }
}

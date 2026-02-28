import type { Collection, Db, Document, WithId } from 'mongodb';
import type { Logger } from 'pino';

export interface ActiveShipmentRecord extends Document {
  shipmentId: string;
  orderId?: string;
  currentState: string;
  lastEventId: string;
  lastEventType: string;
  lastEventAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function isoNow(): string {
  return new Date().toISOString();
}

export class ActiveShipmentsRepository {
  private readonly collection: Collection<ActiveShipmentRecord>;

  public constructor(
    db: Db,
    private readonly logger: Logger,
  ) {
    this.collection = db.collection<ActiveShipmentRecord>('active_shipments');
  }

  public async upsertShipment(record: {
    shipmentId: string;
    orderId?: string;
    currentState: string;
    lastEventId: string;
    lastEventType: string;
    lastEventAt: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const now = isoNow();

    try {
      await this.collection.findOneAndUpdate(
        { shipmentId: record.shipmentId },
        {
          $set: {
            ...record,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      this.logger.warn({ err: error, shipmentId: record.shipmentId }, 'upsertShipment failed');
      throw error;
    }
  }

  public async findByShipmentId(shipmentId: string): Promise<WithId<ActiveShipmentRecord> | null> {
    return this.collection.findOne({ shipmentId });
  }
}

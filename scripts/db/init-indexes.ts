import { MongoClient } from 'mongodb';

async function ensureIndexes(): Promise<void> {
  const mongoUri = process.env.MONGO_URI ?? 'mongodb://localhost:27017';
  const mongoDbName = process.env.MONGO_DB_NAME ?? 'fincart_gateway';

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });

  try {
    await client.connect();
    const db = client.db(mongoDbName);

    const processedEvents = db.collection('processed_events');
    const activeShipments = db.collection('active_shipments');
    const deadLetterEvents = db.collection('dead_letter_events');

    try {
      await processedEvents.createIndex(
        { idempotencyKey: 1 },
        { unique: true, name: 'ux_idempotency_key' },
      );
      console.log('processed_events: created unique index ux_idempotency_key');
    } catch (error) {
      console.log('processed_events: skipping ux_idempotency_key', error);
    }

    try {
      await processedEvents.createIndex(
        { status: 1, updatedAt: 1 },
        { name: 'ix_status_updatedAt' },
      );
      console.log('processed_events: created index ix_status_updatedAt');
    } catch (error) {
      console.log('processed_events: skipping ix_status_updatedAt', error);
    }

    try {
      await processedEvents.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'ttl_expiresAt' },
      );
      console.log('processed_events: created TTL index ttl_expiresAt');
    } catch (error) {
      console.log('processed_events: skipping ttl_expiresAt', error);
    }

    try {
      await activeShipments.createIndex(
        { shipmentId: 1 },
        { unique: true, name: 'ux_shipment_id' },
      );
      console.log('active_shipments: created unique index ux_shipment_id');
    } catch (error) {
      console.log('active_shipments: skipping ux_shipment_id', error);
    }

    try {
      await activeShipments.createIndex({ orderId: 1 }, { name: 'ix_order_id' });
      console.log('active_shipments: created index ix_order_id');
    } catch (error) {
      console.log('active_shipments: skipping ix_order_id', error);
    }

    try {
      await activeShipments.createIndex(
        { currentState: 1, updatedAt: 1 },
        { name: 'ix_currentState_updatedAt' },
      );
      console.log('active_shipments: created index ix_currentState_updatedAt');
    } catch (error) {
      console.log('active_shipments: skipping ix_currentState_updatedAt', error);
    }

    try {
      await deadLetterEvents.createIndex(
        { reviewStatus: 1, createdAt: 1 },
        { name: 'ix_reviewStatus_createdAt' },
      );
      console.log('dead_letter_events: created index ix_reviewStatus_createdAt');
    } catch (error) {
      console.log('dead_letter_events: skipping ix_reviewStatus_createdAt', error);
    }

    try {
      await deadLetterEvents.createIndex({ createdAt: 1 }, { name: 'ix_createdAt' });
      console.log('dead_letter_events: created index ix_createdAt');
    } catch (error) {
      console.log('dead_letter_events: skipping ix_createdAt', error);
    }

    try {
      await deadLetterEvents.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'ttl_expiresAt' },
      );
      console.log('dead_letter_events: created TTL index ttl_expiresAt');
    } catch (error) {
      console.log('dead_letter_events: skipping ttl_expiresAt', error);
    }
  } finally {
    await client.close();
  }
}

ensureIndexes().catch((error: unknown) => {
  console.error('Failed to initialize MongoDB indexes', error);
  process.exitCode = 1;
});

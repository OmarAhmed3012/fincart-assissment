import { Db, MongoClient } from 'mongodb';

const SERVER_SELECTION_TIMEOUT_MS = 5000;

export async function connectMongo(uri: string): Promise<MongoClient> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw new Error('Failed to connect to MongoDB for gateway-worker.', {
      cause: error,
    });
  }
}

export function getWorkerDb(client: MongoClient): Db {
  return client.db();
}

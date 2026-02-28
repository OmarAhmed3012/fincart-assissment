import { createHmac, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface GenerateSignedEventOptions {
  signingSecret: string;
  eventId?: string;
  source?: string;
  eventType?: string;
  idempotencyKey?: string;
  shipmentId?: string;
  orderId?: string;
  status?: string;
}

export interface SignedEventPayload {
  body: string;
  headers: {
    'content-type': 'application/json';
    'x-signature': string;
    'x-signature-timestamp': string;
    'x-signature-algorithm': 'hmac-sha256';
    'x-request-id': string;
  };
}

export function generateSignedEvent(options: GenerateSignedEventOptions): SignedEventPayload {
  const source = options.source ?? 'load-test';
  const eventId = options.eventId ?? `evt_${randomUUID()}`;
  const eventType = options.eventType ?? 'shipment.status.updated';
  const idempotencyKey = options.idempotencyKey ?? `${source}:${eventId}`;
  const shipmentId = options.shipmentId ?? `shp_${randomUUID().slice(0, 8)}`;
  const orderId = options.orderId ?? `ord_${randomUUID().slice(0, 8)}`;
  const status = options.status ?? 'out_for_delivery';

  const bodyObject = {
    eventId,
    eventType,
    occurredAt: new Date().toISOString(),
    source,
    idempotencyKey,
    payload: {
      shipmentId,
      orderId,
      status,
    },
  };

  const body = JSON.stringify(bodyObject);
  const rawBody = Buffer.from(body, 'utf-8');
  const signature = createHmac('sha256', options.signingSecret).update(rawBody).digest('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  const requestId = `req_${randomUUID()}`;

  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-signature': signature,
      'x-signature-timestamp': String(timestamp),
      'x-signature-algorithm': 'hmac-sha256',
      'x-request-id': requestId,
    },
  };
}

const isMain = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');

if (isMain) {
  const signingSecret = process.env.SIGNING_SECRET;

  if (!signingSecret || signingSecret.trim().length === 0) {
    throw new Error('SIGNING_SECRET is required for generate-signed-event CLI');
  }

  const event = generateSignedEvent({ signingSecret });
  process.stdout.write(`${JSON.stringify(event, null, 2)}\n`);
}

import type { QueueJobPayload } from '@fincart/shared';

interface QueueProducer {
  add(name: string, data: QueueJobPayload): Promise<unknown>;
}

export async function enqueueEvent(queue: QueueProducer, payload: QueueJobPayload): Promise<void> {
  await queue.add('courier-event', payload);
}

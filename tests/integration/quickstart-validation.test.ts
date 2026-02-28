import { describe, expect, it } from 'vitest';

import { generateSignedEvent } from '../../scripts/signing/generate-signed-event.ts';

// Requires Docker Compose stack running: docker compose up -d
describe.skip('quickstart validation', () => {
  it('verifies health endpoint and accepts one signed event', async () => {
    const baseUrl = process.env.QUICKSTART_API_URL ?? 'http://localhost:3000';
    const signingSecret = process.env.SIGNING_SECRET ?? 'test-secret';

    const healthResponse = await fetch(`${baseUrl}/health`, {
      method: 'GET',
    });

    expect(healthResponse.status).toBe(200);
    const healthJson = (await healthResponse.json()) as { status?: string };
    expect(healthJson.status).toBe('healthy');

    const signed = generateSignedEvent({ signingSecret });
    const ingestResponse = await fetch(`${baseUrl}/v1/events/courier`, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
    });

    expect(ingestResponse.status).toBe(202);
    const ingestJson = (await ingestResponse.json()) as { acknowledged?: boolean };
    expect(ingestJson.acknowledged).toBe(true);
  });
});

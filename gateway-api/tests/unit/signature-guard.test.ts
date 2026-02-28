import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { describe, expect, it, vi } from 'vitest';

import { computeHmacHex } from '@fincart/shared';

import { createSignatureGuard } from '../../src/middleware/signature-guard.js';

const SIGNING_SECRET = 'unit-test-secret';

describe('signature guard', () => {
  it('accepts valid signature over raw body', async () => {
    const app = Fastify();
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: false,
      runFirst: true,
    });

    app.post(
      '/signed',
      {
        preHandler: createSignatureGuard({
          signingSecret: SIGNING_SECRET,
          signatureToleranceSeconds: 300,
        }),
      },
      async () => ({ ok: true }),
    );

    const body = JSON.stringify({ hello: 'world' });
    const signature = computeHmacHex(Buffer.from(body), SIGNING_SECRET, 'sha256');

    const response = await app.inject({
      method: 'POST',
      url: '/signed',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-signature': signature,
        'x-signature-algorithm': 'hmac-sha256',
        'x-signature-timestamp': String(Math.floor(Date.now() / 1000)),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('rejects stale timestamp', async () => {
    const app = Fastify();
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: false,
      runFirst: true,
    });

    app.post(
      '/signed',
      {
        preHandler: createSignatureGuard({
          signingSecret: SIGNING_SECRET,
          signatureToleranceSeconds: 10,
        }),
      },
      async () => ({ ok: true }),
    );

    const body = JSON.stringify({ hello: 'world' });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const signature = computeHmacHex(Buffer.from(body), SIGNING_SECRET, 'sha256');

    const response = await app.inject({
      method: 'POST',
      url: '/signed',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-signature': signature,
        'x-signature-algorithm': 'hmac-sha256',
        'x-signature-timestamp': String(staleTimestamp),
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      acknowledged: false,
      errorCode: 'INVALID_SIGNATURE',
    });
  });

  it('rejects invalid signature value', async () => {
    const app = Fastify();
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: false,
      runFirst: true,
    });

    const handler = vi.fn().mockResolvedValue({ ok: true });

    app.post(
      '/signed',
      {
        preHandler: createSignatureGuard({
          signingSecret: SIGNING_SECRET,
          signatureToleranceSeconds: 300,
        }),
      },
      handler,
    );

    const body = JSON.stringify({ hello: 'world' });

    const response = await app.inject({
      method: 'POST',
      url: '/signed',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-signature': '00ff',
        'x-signature-algorithm': 'hmac-sha256',
        'x-signature-timestamp': String(Math.floor(Date.now() / 1000)),
      },
    });

    expect(response.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects requests with missing signature headers', async () => {
    const app = Fastify();
    await app.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: false,
      runFirst: true,
    });

    app.post(
      '/signed',
      {
        preHandler: createSignatureGuard({
          signingSecret: SIGNING_SECRET,
          signatureToleranceSeconds: 300,
        }),
      },
      async () => ({ ok: true }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/signed',
      payload: JSON.stringify({ hello: 'world' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().errorCode).toBe('INVALID_SIGNATURE');
  });
});

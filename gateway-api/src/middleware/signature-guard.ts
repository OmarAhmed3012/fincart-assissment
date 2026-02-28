import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import type { HmacAlgorithm, SignatureMeta } from '@fincart/shared';
import { verifyHmacSignature } from '@fincart/shared';

interface SignatureGuardOptions {
  signingSecret: string;
  signatureToleranceSeconds: number;
}

interface ErrorResponseBody {
  acknowledged: false;
  errorCode: 'INVALID_SIGNATURE' | 'INVALID_PAYLOAD';
  message: string;
  traceId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string | Buffer;
    signatureMeta?: SignatureMeta;
  }
}

function parseAlgorithm(raw: string): HmacAlgorithm | null {
  const normalized = raw.trim().toLowerCase();

  if (normalized === 'hmac-sha256') {
    return 'sha256';
  }

  if (normalized === 'hmac-sha512') {
    return 'sha512';
  }

  return null;
}

function getTraceId(request: FastifyRequest): string {
  const requestIdHeader = request.headers['x-request-id'];

  if (typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0) {
    return requestIdHeader;
  }

  return request.id;
}

function sendError(
  reply: FastifyReply,
  statusCode: 400 | 401,
  errorCode: ErrorResponseBody['errorCode'],
  message: string,
  traceId: string,
): FastifyReply {
  return reply.status(statusCode).send({
    acknowledged: false,
    errorCode,
    message,
    traceId,
  } satisfies ErrorResponseBody);
}

export function createSignatureGuard(options: SignatureGuardOptions): preHandlerHookHandler {
  return async function signatureGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void | FastifyReply> {
    const traceId = getTraceId(request);
    const signatureHeader = request.headers['x-signature'];
    const timestampHeader = request.headers['x-signature-timestamp'];
    const algorithmHeader = request.headers['x-signature-algorithm'];

    if (
      typeof signatureHeader !== 'string' ||
      typeof timestampHeader !== 'string' ||
      typeof algorithmHeader !== 'string'
    ) {
      return sendError(reply, 401, 'INVALID_SIGNATURE', 'Missing signature headers', traceId);
    }

    const algorithm = parseAlgorithm(algorithmHeader);
    if (!algorithm) {
      return sendError(reply, 401, 'INVALID_SIGNATURE', 'Unsupported signature algorithm', traceId);
    }

    const timestampSeconds = Number.parseInt(timestampHeader, 10);
    if (!Number.isInteger(timestampSeconds) || timestampSeconds <= 0) {
      return sendError(
        reply,
        400,
        'INVALID_PAYLOAD',
        'Invalid signature timestamp header',
        traceId,
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const skew = Math.abs(nowSeconds - timestampSeconds);
    if (skew > options.signatureToleranceSeconds) {
      return sendError(
        reply,
        401,
        'INVALID_SIGNATURE',
        'Signature timestamp is outside tolerance',
        traceId,
      );
    }

    const rawBody = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      return sendError(reply, 400, 'INVALID_PAYLOAD', 'Raw request body is unavailable', traceId);
    }

    const verification = verifyHmacSignature({
      input: rawBody,
      secret: options.signingSecret,
      algorithm,
      providedSignatureHex: signatureHeader,
    });

    if (!verification.ok) {
      return sendError(reply, 401, 'INVALID_SIGNATURE', verification.reason, traceId);
    }

    request.signatureMeta = {
      algorithm,
      timestamp: timestampSeconds,
      signatureHeader,
    };
  };
}

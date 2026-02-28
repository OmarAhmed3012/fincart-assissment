import { createHmac, timingSafeEqual } from 'node:crypto';
function isStrictHex(value) {
    return /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0;
}
function toHexBuffer(hex) {
    const normalized = hex.trim().toLowerCase();
    if (!isStrictHex(normalized)) {
        return null;
    }
    return Buffer.from(normalized, 'hex');
}
export function computeHmacHex(input, secret, algorithm) {
    return createHmac(algorithm, secret).update(input).digest('hex');
}
export function timingSafeEqualHex(aHex, bHex) {
    const aBuffer = toHexBuffer(aHex);
    const bBuffer = toHexBuffer(bHex);
    if (!aBuffer || !bBuffer) {
        return false;
    }
    if (aBuffer.length !== bBuffer.length) {
        const maxLen = Math.max(aBuffer.length, bBuffer.length);
        const paddedA = Buffer.alloc(maxLen);
        const paddedB = Buffer.alloc(maxLen);
        aBuffer.copy(paddedA);
        bBuffer.copy(paddedB);
        timingSafeEqual(paddedA, paddedB);
        return false;
    }
    return timingSafeEqual(aBuffer, bBuffer);
}
export function verifyHmacSignature(opts) {
    if (!opts.secret || opts.secret.trim().length === 0) {
        return { ok: false, reason: 'Secret must be non-empty.' };
    }
    if (opts.input.length === 0) {
        return { ok: false, reason: 'Input buffer is empty.' };
    }
    const computed = computeHmacHex(opts.input, opts.secret, opts.algorithm);
    const isValid = timingSafeEqualHex(computed, opts.providedSignatureHex);
    if (!isValid) {
        return { ok: false, reason: 'Signature mismatch.' };
    }
    return { ok: true };
}
//# sourceMappingURL=hmac.js.map
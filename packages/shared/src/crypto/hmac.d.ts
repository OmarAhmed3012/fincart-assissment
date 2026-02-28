export type HmacAlgorithm = 'sha256' | 'sha512';
export interface VerifyHmacSignatureOptions {
    input: Buffer;
    secret: string;
    algorithm: HmacAlgorithm;
    providedSignatureHex: string;
}
export declare function computeHmacHex(input: Buffer, secret: string, algorithm: HmacAlgorithm): string;
export declare function timingSafeEqualHex(aHex: string, bHex: string): boolean;
export declare function verifyHmacSignature(opts: VerifyHmacSignatureOptions): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
//# sourceMappingURL=hmac.d.ts.map
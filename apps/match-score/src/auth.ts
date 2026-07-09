import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';

type VerifyAuthParams = {
    request: FastifyRequest;
    keyId: string;
    secret: string;
    maxSkewSeconds?: number;
};

function safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);

    if (aBuf.length !== bBuf.length) {
        return false;
    }

    return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyDpgScoringHeaders({
    request,
    keyId,
    secret,
    maxSkewSeconds = 300,
}: VerifyAuthParams): boolean {
    const requestKey = String(request.headers['x-dpg-key'] ?? '');
    const timestamp = String(request.headers['x-dpg-timestamp'] ?? '');
    const nonce = String(request.headers['x-dpg-nonce'] ?? '');
    const signature = String(request.headers['x-dpg-signature'] ?? '');

    if (!requestKey || !timestamp || !nonce || !signature) {
        return false;
    }

    if (!safeEqual(requestKey, keyId)) {
        return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const requestTs = Number(timestamp);

    if (!Number.isFinite(requestTs) || Math.abs(now - requestTs) > maxSkewSeconds) {
        return false;
    }

    const path = new URL(request.url, 'http://localhost').pathname;
    const baseString = [request.method.toUpperCase(), path, timestamp, nonce].join('\n');
    const expectedSignature =
        'sha256=' + crypto.createHmac('sha256', secret).update(baseString).digest('hex');

    return safeEqual(signature, expectedSignature);
}

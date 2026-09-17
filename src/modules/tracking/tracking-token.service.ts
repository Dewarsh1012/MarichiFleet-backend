import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { AppError } from '../../platform/errors.js';

const TOKEN_VERSION = 'v1';

function trackingSecret(): string {
  const secret = process.env.TRACKING_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Public tracking token signing is not configured',
      503
    );
  }
  return secret;
}

function signature(payload: string, secret = trackingSecret()): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSignedOpaqueToken(secret?: string): string {
  const payload = `${TOKEN_VERSION}.${randomBytes(32).toString('base64url')}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySignedOpaqueToken(token: string, secret?: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashTrackingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

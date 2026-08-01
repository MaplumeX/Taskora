import { randomBytes, createHash } from 'node:crypto';

export const RT_COOKIE_NAME = 'rt';

export const RT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: RT_TTL_MS,
};

export function generateRt(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRt(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

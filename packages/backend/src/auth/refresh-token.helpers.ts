import { createHash, randomBytes } from 'node:crypto';
import type { Request as ExpressRequest } from 'express';

export const RT_COOKIE_NAME = 'rt';

/** Header desktop clients send to opt into the body-based refresh flow. */
export const CLIENT_KIND_HEADER = 'x-client';
export const CLIENT_KIND_DESKTOP = 'desktop';

/** True when the request comes from a desktop (non-cookie) client. */
export function isDesktopClient(req: ExpressRequest): boolean {
  return req.headers[CLIENT_KIND_HEADER] === CLIENT_KIND_DESKTOP;
}

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

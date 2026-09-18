import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

import { AuthController } from '../src/auth/auth.controller';
import { RT_COOKIE_NAME } from '../src/auth/refresh-token.helpers';

/**
 * Controller-level unit tests for the two refresh-token transports:
 * web (HttpOnly cookie + CSRF check) and desktop (body credential,
 * stored in the OS keychain by the client).
 */
describe('AuthController — refresh token transports', () => {
  let controller: AuthController;
  let authService: {
    login: ReturnType<typeof vi.fn>;
    rotateRefreshToken: ReturnType<typeof vi.fn>;
    revokeRefreshToken: ReturnType<typeof vi.fn>;
  };

  const user = { id: 'user-1', email: 'a@b.c', displayName: null, avatarUrl: null };

  const makeReq = (headers: Record<string, string> = {}, cookies: Record<string, string> = {}) =>
    ({ headers, cookies }) as never;

  beforeEach(() => {
    authService = {
      login: vi.fn(),
      rotateRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
    };
    controller = new AuthController(authService as never);
  });

  describe('POST /auth/login', () => {
    it('web: sets the HttpOnly cookie and omits the token from the body', async () => {
      authService.login.mockResolvedValue({ accessToken: 'at', rt: 'rt-1', user });
      const res = { cookie: vi.fn() } as never;

      const body = await controller.login(makeReq(), { email: 'a@b.c', password: 'password123' }, res);

      expect(res.cookie).toHaveBeenCalledWith(RT_COOKIE_NAME, 'rt-1', expect.anything());
      expect(body).toEqual({ accessToken: 'at', user });
      expect(body).not.toHaveProperty('refreshToken');
    });

    it('desktop: returns the refresh token in the body, no cookie', async () => {
      authService.login.mockResolvedValue({ accessToken: 'at', rt: 'rt-1', user });
      const res = { cookie: vi.fn() } as never;

      const body = await controller.login(
        makeReq({ 'x-client': 'desktop' }),
        { email: 'a@b.c', password: 'password123' },
        res,
      );

      expect(res.cookie).not.toHaveBeenCalled();
      expect(body).toEqual({ accessToken: 'at', refreshToken: 'rt-1', user });
    });
  });

  describe('POST /auth/refresh', () => {
    it('desktop: rotates the body refresh token and returns the new one', async () => {
      authService.rotateRefreshToken.mockResolvedValue({
        accessToken: 'at-2',
        user,
        newRt: 'rt-2',
      });
      const res = { cookie: vi.fn(), clearCookie: vi.fn() } as never;

      const body = await controller.refresh(
        makeReq({ 'x-client': 'desktop' }),
        { refreshToken: 'rt-1' },
        res,
      );

      expect(authService.rotateRefreshToken).toHaveBeenCalledWith('rt-1');
      expect(res.cookie).not.toHaveBeenCalled();
      expect(body).toEqual({ accessToken: 'at-2', refreshToken: 'rt-2', user });
    });

    it('desktop: invalid body token → 401 without touching cookies', async () => {
      authService.rotateRefreshToken.mockRejectedValue(new UnauthorizedException());
      const res = { cookie: vi.fn(), clearCookie: vi.fn() } as never;

      await expect(
        controller.refresh(makeReq({ 'x-client': 'desktop' }), { refreshToken: 'bad' }, res),
      ).rejects.toThrow(UnauthorizedException);
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('web: cross-site cookie requests are rejected (CSRF)', async () => {
      const res = { cookie: vi.fn(), clearCookie: vi.fn() } as never;

      await expect(
        controller.refresh(makeReq({ 'sec-fetch-site': 'cross-site' }), {}, res),
      ).rejects.toThrow('Cross-site request not allowed');
      expect(authService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('web: same-site cookie flow still works and re-sets the cookie', async () => {
      authService.rotateRefreshToken.mockResolvedValue({
        accessToken: 'at-2',
        user,
        newRt: 'rt-2',
      });
      const res = { cookie: vi.fn(), clearCookie: vi.fn() } as never;

      const body = await controller.refresh(
        makeReq({ 'sec-fetch-site': 'same-origin' }, { [RT_COOKIE_NAME]: 'rt-1' }),
        {},
        res,
      );

      expect(authService.rotateRefreshToken).toHaveBeenCalledWith('rt-1');
      expect(res.cookie).toHaveBeenCalledWith(RT_COOKIE_NAME, 'rt-2', expect.anything());
      expect(body).toEqual({ accessToken: 'at-2', user });
    });
  });

  describe('POST /auth/logout', () => {
    it('desktop: revokes the body refresh token', async () => {
      const res = { clearCookie: vi.fn() } as never;

      await controller.logout(makeReq({ 'x-client': 'desktop' }), { refreshToken: 'rt-1' }, res);

      expect(authService.revokeRefreshToken).toHaveBeenCalledWith('rt-1');
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('web: revokes the cookie refresh token', async () => {
      const res = { clearCookie: vi.fn() } as never;

      await controller.logout(makeReq({}, { [RT_COOKIE_NAME]: 'rt-1' }), {}, res);

      expect(authService.revokeRefreshToken).toHaveBeenCalledWith('rt-1');
    });

    it('works without an access token and stays idempotent with no RT at all', async () => {
      // No JwtAuthGuard: an expired access token must not break logout.
      const res = { clearCookie: vi.fn() } as never;

      const body = await controller.logout(makeReq(), {}, res);

      expect(authService.revokeRefreshToken).toHaveBeenCalledWith(undefined);
      expect(body).toEqual({ ok: true });
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });
});

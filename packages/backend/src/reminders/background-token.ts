import { generateRt, hashRt } from '../auth/refresh-token.helpers';

/**
 * 后台凭据（local-first-v3 issue 09）：Android 的后台同步不经 App 的会话
 * 令牌——原生侧若自行刷新，会和 JS 争 refresh token 的轮换，输的一方被
 * 登出。设备注册时另发一枚只读凭据，只能读提醒计划，和设备绑定。
 *
 * 有效期与 refresh token 一致：App 每次启动注册设备时轮换并续期；30 天
 * 没打开过 App，后台同步随之停止。
 */
export const BACKGROUND_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function issueBackgroundToken(now = new Date()) {
  const token = generateRt();
  return {
    token,
    hash: hashRt(token),
    expiresAt: new Date(now.getTime() + BACKGROUND_TOKEN_TTL_MS),
  };
}

export { hashRt as hashBackgroundToken };

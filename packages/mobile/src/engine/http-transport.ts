/**
 * 同步传输层：共用 @taskora/api 的 HTTP 实现（协议版本头、426 → 升级
 * 提示，local-first-v3 issue 03），这里只绑定平台标识。
 */

import { createHttpSyncTransport as createTransport, registerSyncDevice } from '@taskora/api';
import type { SyncTransport } from '@taskora/engine';

export function createHttpSyncTransport(): SyncTransport {
  return createTransport('mobile');
}

/**
 * 登录设备注册（ADR-0007）：device id 分配后上报 hub，同时取回后台同步
 * 用的只读凭据（local-first-v3 issue 09）。
 */
export async function registerDevice(deviceId: string): Promise<string | null> {
  const { backgroundToken } = await registerSyncDevice(deviceId, 'mobile', {
    backgroundToken: true,
  });
  return backgroundToken ?? null;
}

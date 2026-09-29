/**
 * 同步传输层：共用 @taskora/api 的 HTTP 实现（协议版本头、426 → 升级
 * 提示，local-first-v3 issue 03），这里只绑定平台标识。
 */

import { createHttpSyncTransport as createTransport, registerSyncDevice } from '@taskora/api';
import type { SyncTransport } from '@taskora/engine';

export function createHttpSyncTransport(): SyncTransport {
  return createTransport('mobile');
}

/** 登录设备注册（ADR-0007）：device id 分配后上报 hub。 */
export async function registerDevice(deviceId: string): Promise<void> {
  await registerSyncDevice(deviceId, 'mobile');
}

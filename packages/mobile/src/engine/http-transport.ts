/**
 * 同步传输层（HTTP）— Engine ↔ Sync Hub 的设备侧实现。
 *
 * 推拉式三段（ADR-0007）：push batch / pull since cursor / bootstrap
 * snapshot，全部走 JWT 保护的 /sync 端点。断网时调用抛错，由调用方
 * （mobile-engine 调度器）在下个前台时机重试。与 desktop 同构，
 * 仅 device label 标记为 mobile。
 */

import { apiClient } from '@taskora/api';
import type {
  BootstrapResponse,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncTransport,
} from '@taskora/engine';

export function createHttpSyncTransport(): SyncTransport {
  return {
    async push(request: PushRequest): Promise<PushResponse> {
      const response = await apiClient.post<PushResponse>('/sync/push', request);
      return response.data;
    },
    async pull(request: PullRequest): Promise<PullResponse> {
      const response = await apiClient.get<PullResponse>('/sync/pull', {
        params: { cursor: request.cursor },
      });
      return response.data;
    },
    async bootstrap(): Promise<BootstrapResponse> {
      const response = await apiClient.get<BootstrapResponse>('/sync/bootstrap');
      return response.data;
    },
  };
}

/** 登录设备注册（ADR-0007）：device id 分配后上报 hub。 */
export async function registerDevice(deviceId: string): Promise<void> {
  await apiClient.post('/sync/devices', { deviceId, label: 'mobile' });
}

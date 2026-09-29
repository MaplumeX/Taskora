/**
 * 同步传输层（HTTP）— Engine ↔ Sync Hub 的设备侧实现，桌面端、移动端与 web 共用。
 *
 * 推拉式三段（ADR-0007）：push batch / pull since cursor / bootstrap
 * snapshot，全部走 JWT 保护的 /sync 端点。断网时调用抛错，由调用方的
 * 同步调度器重试。
 *
 * 协议版本（local-first-v3 issue 03）：每个请求带协议版本头与客户端
 * 标识；hub 回 426 时抛 SyncUpgradeRequiredError，调度器据此停止同步、
 * 提示升级（Outbox 保留）。
 */

import axios from 'axios';

import {
  SYNC_CLIENT_HEADER,
  SYNC_PROTOCOL_HEADER,
  SYNC_PROTOCOL_VERSION,
  SyncUpgradeRequiredError,
  type BootstrapResponse,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncTransport,
} from '@taskora/engine';

import { apiClient } from '@/api/client';
import { getAppVersion } from '@/utils/appInfo';

export type SyncClientPlatform = 'desktop' | 'mobile' | 'web';

/** 协议版本头 + 客户端标识（版本号在 boot 时异步注入，按请求读取）。 */
function syncHeaders(platform: SyncClientPlatform): Record<string, string> {
  return {
    [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION),
    [SYNC_CLIENT_HEADER]: `${platform}/${getAppVersion()}`,
  };
}

/** HTTP 426 → SyncUpgradeRequiredError；其余错误原样抛出（断网、5xx 等照常重试）。 */
function upgradeRequired(error: unknown): never {
  if (axios.isAxiosError(error) && error.response?.status === 426) {
    const body = error.response.data as { minProtocolVersion?: unknown } | undefined;
    const min = typeof body?.minProtocolVersion === 'number' ? body.minProtocolVersion : undefined;
    throw new SyncUpgradeRequiredError(min);
  }
  throw error;
}

export function createHttpSyncTransport(platform: SyncClientPlatform): SyncTransport {
  return {
    async push(request: PushRequest): Promise<PushResponse> {
      const response = await apiClient
        .post<PushResponse>('/sync/push', request, { headers: syncHeaders(platform) })
        .catch(upgradeRequired);
      return response.data;
    },
    async pull(request: PullRequest): Promise<PullResponse> {
      const response = await apiClient
        .get<PullResponse>('/sync/pull', {
          params: { cursor: request.cursor },
          headers: syncHeaders(platform),
        })
        .catch(upgradeRequired);
      return response.data;
    },
    async bootstrap(): Promise<BootstrapResponse> {
      const response = await apiClient
        .get<BootstrapResponse>('/sync/bootstrap', { headers: syncHeaders(platform) })
        .catch(upgradeRequired);
      return response.data;
    },
  };
}

/** 登录设备注册（ADR-0007）：device id 分配后上报 hub。 */
export async function registerSyncDevice(
  deviceId: string,
  platform: SyncClientPlatform,
): Promise<void> {
  await apiClient.post('/sync/devices', { deviceId, label: platform });
}

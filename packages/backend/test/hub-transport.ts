import type { SyncTransport } from '@taskora/engine';

import { withHubInfo } from '../src/sync/sync.controller';

/**
 * 直连 SyncHubService 的测试传输层套上 controller 的版本信封：生产路径的每个
 * 同步响应都带协议版本，设备拿不到时按过旧的 hub 暂停同步（ADR-0026）。
 */
export function viaController(transport: SyncTransport): SyncTransport {
  return {
    push: async (request) => withHubInfo(await transport.push(request)),
    pull: async (request) => withHubInfo(await transport.pull(request)),
    bootstrap: async (request) => withHubInfo(await transport.bootstrap(request)),
  };
}

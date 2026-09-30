import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SYNC_CLIENT_HEADER,
  SYNC_PROTOCOL_HEADER,
  SYNC_PROTOCOL_VERSION,
  SyncUpgradeRequiredError,
} from '@taskora/engine';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

import { apiClient } from '@/api/client';
import { setAppVersion } from '@/utils/appInfo';
import { createHttpSyncTransport } from './http-sync-transport';

function httpError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', String(status), config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

describe('createHttpSyncTransport（协议版本，local-first-v3 issue 03）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppVersion('1.2.3');
  });

  it('每个请求带协议版本头与客户端标识', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { acked: 0 } });
    vi.mocked(apiClient.get).mockResolvedValue({ data: { changes: [], cursor: 0, resync: false } });
    const transport = createHttpSyncTransport('desktop');

    await transport.push({ deviceId: 'd', events: [] });
    await transport.pull({ cursor: 7 });
    await transport.bootstrap();
    await transport.bootstrap({ page: 'next-token' });
    await transport.fetchEntities!({ entity: 'task', ids: ['t1'] });

    const expected = {
      [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION),
      [SYNC_CLIENT_HEADER]: 'desktop/1.2.3',
    };
    expect(vi.mocked(apiClient.post).mock.calls[0][2]).toEqual({ headers: expected });
    expect(vi.mocked(apiClient.get).mock.calls[0][1]).toEqual({
      params: { cursor: 7 },
      headers: expected,
    });
    expect(vi.mocked(apiClient.get).mock.calls[1][1]).toEqual({ params: {}, headers: expected });
    // 分页参数走查询串（旧 hub 忽略，照常回整包）
    expect(vi.mocked(apiClient.get).mock.calls[2][1]).toEqual({
      params: { page: 'next-token' },
      headers: expected,
    });
    expect(vi.mocked(apiClient.post).mock.calls[1]).toEqual([
      '/sync/entities',
      { entity: 'task', ids: ['t1'] },
      { headers: expected },
    ]);
  });

  it('HTTP 426 → SyncUpgradeRequiredError（带 hub 的最低版本）', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(httpError(426, { minProtocolVersion: 3 }));
    const transport = createHttpSyncTransport('mobile');

    const error = await transport.pull({ cursor: 0 }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SyncUpgradeRequiredError);
    expect(error).toMatchObject({ minProtocolVersion: 3 });
  });

  it('其他错误原样抛出（断网、5xx 照常重试）', async () => {
    const serverError = httpError(503, {});
    vi.mocked(apiClient.post).mockRejectedValue(serverError);
    const transport = createHttpSyncTransport('desktop');

    await expect(transport.push({ deviceId: 'd', events: [] })).rejects.toBe(serverError);
  });
});

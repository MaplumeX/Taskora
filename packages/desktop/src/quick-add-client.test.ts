import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  emitTo: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(name, cb);
    return mocks.unlisten;
  }),
  emitTo: mocks.emitTo,
}));

import { areaKeys, projectKeys, tagGroupKeys, tagKeys } from '@taskora/api';

import {
  applyQuickAddSnapshot,
  requestQuickAddSnapshot,
  submitQuickAddDraft,
} from './quick-add-client';
import {
  QUICK_ADD_SNAPSHOT_EVENT,
  QUICK_ADD_SNAPSHOT_REQUEST_EVENT,
  QUICK_ADD_SUBMIT_EVENT,
  type QuickAddSnapshot,
} from './quick-add-protocol';

const snapshot = (requestId: string): QuickAddSnapshot => ({
  requestId,
  projects: [{ id: 'p1' }] as QuickAddSnapshot['projects'],
  areas: [{ id: 'a1' }] as QuickAddSnapshot['areas'],
  tags: [{ id: 't1' }] as QuickAddSnapshot['tags'],
  tagGroups: [{ id: 'g1' }] as QuickAddSnapshot['tagGroups'],
});

/** 主窗口应答：对最近一次请求回发快照（可选先回发一个别人的应答）。 */
function answerWith(make: (requestId: string) => QuickAddSnapshot) {
  mocks.emitTo.mockImplementation(async (_target: string, name: string, payload: unknown) => {
    if (name !== QUICK_ADD_SNAPSHOT_REQUEST_EVENT) return;
    const { requestId } = payload as { requestId: string };
    const deliver = mocks.listeners.get(QUICK_ADD_SNAPSHOT_EVENT)!;
    deliver({ payload: snapshot('someone-else') });
    deliver({ payload: make(requestId) });
  });
}

beforeEach(() => {
  mocks.listeners.clear();
  mocks.emitTo.mockReset().mockResolvedValue(undefined);
  mocks.unlisten.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('quick-add 客户端', () => {
  it('先挂监听再发请求，只认自己的 requestId，结束后解除监听', async () => {
    answerWith(snapshot);
    const result = await requestQuickAddSnapshot();

    const [target, name, payload] = mocks.emitTo.mock.calls[0];
    expect([target, name]).toEqual(['main', QUICK_ADD_SNAPSHOT_REQUEST_EVENT]);
    expect(result?.requestId).toBe((payload as { requestId: string }).requestId);
    expect(mocks.unlisten).toHaveBeenCalled();
  });

  it('主窗口不应答时超时返回 null', async () => {
    vi.useFakeTimers();
    const pending = requestQuickAddSnapshot(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    expect(mocks.unlisten).toHaveBeenCalled();
  });

  it('快照按各列表查询键写入缓存', () => {
    const queryClient = new QueryClient();
    applyQuickAddSnapshot(queryClient, snapshot('r'));
    expect(queryClient.getQueryData(projectKeys.all)).toEqual([{ id: 'p1' }]);
    expect(queryClient.getQueryData(areaKeys.all)).toEqual([{ id: 'a1' }]);
    expect(queryClient.getQueryData(tagKeys.all)).toEqual([{ id: 't1' }]);
    expect(queryClient.getQueryData(tagGroupKeys.all)).toEqual([{ id: 'g1' }]);
  });

  it('提交草稿带 requestId 发给主窗口', async () => {
    const requestId = await submitQuickAddDraft({ title: '买牛奶' });
    expect(mocks.emitTo).toHaveBeenCalledWith('main', QUICK_ADD_SUBMIT_EVENT, {
      draft: { title: '买牛奶' },
      requestId,
    });
  });
});

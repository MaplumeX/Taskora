import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  emitTo: vi.fn(),
  invoke: vi.fn(),
  createFromQuickAddDraft: vi.fn(),
  getProjects: vi.fn(),
  getAreas: vi.fn(),
  getTags: vi.fn(),
  getTagGroups: vi.fn(),
  toastError: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen, emitTo: mocks.emitTo }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taskora/api')>()),
  createFromQuickAddDraft: mocks.createFromQuickAddDraft,
  getProjects: mocks.getProjects,
  getAreas: mocks.getAreas,
  getTags: mocks.getTags,
  getTagGroups: mocks.getTagGroups,
}));
vi.mock('@taskora/ui/components/ui/sonner', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('./engine/tauri-storage', () => ({ isTauriRuntime: mocks.isTauri }));

import { initQuickAddRelay } from './quick-add-relay';
import {
  QUICK_ADD_RESULT_EVENT,
  QUICK_ADD_SNAPSHOT_EVENT,
  QUICK_ADD_SNAPSHOT_REQUEST_EVENT,
  QUICK_ADD_SUBMIT_EVENT,
} from './quick-add-protocol';

/** 抓取 initQuickAddRelay 对某事件注册的监听器。 */
function handlerFor(eventName: string): (event: { payload: unknown }) => Promise<void> {
  const call = mocks.listen.mock.calls.find(([name]) => name === eventName);
  expect(call).toBeDefined();
  return call![1] as (event: { payload: unknown }) => Promise<void>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isTauri.mockReturnValue(true);
  mocks.listen.mockResolvedValue(() => undefined);
  mocks.emitTo.mockResolvedValue(undefined);
  mocks.invoke.mockResolvedValue(undefined);
  mocks.createFromQuickAddDraft.mockResolvedValue({
    taskId: 'task-1',
    placedIn: { kind: 'inbox' },
  });
});

describe('quick-add 事件中继：提交', () => {
  it('草稿载荷交给共用的 createFromQuickAddDraft，回执落入位置', async () => {
    initQuickAddRelay();
    await handlerFor(QUICK_ADD_SUBMIT_EVENT)({
      payload: {
        requestId: 'r1',
        draft: { title: '量尺寸', when: { type: 'someday' }, tagIds: ['t1'], bogus: 1 },
      },
    });

    expect(mocks.createFromQuickAddDraft).toHaveBeenCalledWith({
      title: '量尺寸',
      when: { type: 'someday' },
      tagIds: ['t1'],
    });
    expect(mocks.emitTo).toHaveBeenCalledWith('quick-add', QUICK_ADD_RESULT_EVENT, {
      requestId: 'r1',
      ok: true,
      taskId: 'task-1',
      placedIn: { kind: 'inbox' },
    });
  });

  it('兼容旧载荷 { title }', async () => {
    initQuickAddRelay();
    await handlerFor(QUICK_ADD_SUBMIT_EVENT)({ payload: { title: '  买牛奶  ' } });
    expect(mocks.createFromQuickAddDraft).toHaveBeenCalledWith({ title: '  买牛奶  ' });
  });

  it('空标题不回执；格式不对的载荷忽略', async () => {
    mocks.createFromQuickAddDraft.mockResolvedValueOnce(null);
    initQuickAddRelay();
    const handler = handlerFor(QUICK_ADD_SUBMIT_EVENT);

    await handler({ payload: { title: '   ' } });
    await handler({ payload: { draft: 'nope' } });
    await handler({ payload: null });
    expect(mocks.createFromQuickAddDraft).toHaveBeenCalledTimes(1);
    expect(mocks.emitTo).not.toHaveBeenCalled();
  });

  it('创建失败：toast + 系统通知 + 失败回执', async () => {
    mocks.createFromQuickAddDraft.mockRejectedValueOnce(new Error('disk full'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    initQuickAddRelay();
    await handlerFor(QUICK_ADD_SUBMIT_EVENT)({
      payload: { requestId: 'r2', draft: { title: ' 写周报 ' } },
    });

    expect(mocks.toastError).toHaveBeenCalledWith('写周报');
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:notification|notify', {
      options: { title: expect.any(String), body: '写周报' },
    });
    expect(mocks.emitTo).toHaveBeenCalledWith('quick-add', QUICK_ADD_RESULT_EVENT, {
      requestId: 'r2',
      ok: false,
      title: '写周报',
    });
    error.mockRestore();
  });
});

describe('quick-add 事件中继：快照', () => {
  it('从当前 backend 读 Projects / Areas / Tags / Tag Groups 回发给 quick-add', async () => {
    mocks.getProjects.mockResolvedValue([{ id: 'p1' }]);
    mocks.getAreas.mockResolvedValue([{ id: 'a1' }]);
    mocks.getTags.mockResolvedValue([{ id: 't1' }]);
    mocks.getTagGroups.mockResolvedValue([{ id: 'g1' }]);
    initQuickAddRelay();
    await handlerFor(QUICK_ADD_SNAPSHOT_REQUEST_EVENT)({ payload: { requestId: 'r3' } });

    expect(mocks.emitTo).toHaveBeenCalledWith('quick-add', QUICK_ADD_SNAPSHOT_EVENT, {
      requestId: 'r3',
      projects: [{ id: 'p1' }],
      areas: [{ id: 'a1' }],
      tags: [{ id: 't1' }],
      tagGroups: [{ id: 'g1' }],
    });
  });

  it('读取失败或缺 requestId 时不应答（quick-add 自行超时）', async () => {
    mocks.getProjects.mockRejectedValue(new Error('not ready'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    initQuickAddRelay();
    const handler = handlerFor(QUICK_ADD_SNAPSHOT_REQUEST_EVENT);

    await handler({ payload: { requestId: 'r4' } });
    await handler({ payload: {} });
    expect(mocks.emitTo).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('quick-add 事件中继：装配', () => {
  it('非 Tauri 环境不订阅', () => {
    mocks.isTauri.mockReturnValue(false);
    initQuickAddRelay();
    expect(mocks.listen).not.toHaveBeenCalled();
  });
});

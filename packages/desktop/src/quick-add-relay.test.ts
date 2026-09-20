import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  createTask: vi.fn(),
  toastError: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen,
}));
vi.mock('@taskora/api', () => ({
  currentTaskBackend: () => ({ createTask: mocks.createTask }),
}));
vi.mock('@taskora/ui/components/ui/sonner', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('./engine/tauri-storage', () => ({ isTauriRuntime: mocks.isTauri }));

import { initQuickAddRelay } from './quick-add-relay';

/** 抓取 initQuickAddRelay 注册的监听器。 */
async function registeredHandler(): Promise<(event: { payload: { title: string } }) => void> {
  const call = mocks.listen.mock.calls.at(-1);
  expect(call?.[0]).toBe('quick-add://submit');
  return call![1] as (event: { payload: { title: string } }) => void;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isTauri.mockReturnValue(true);
  mocks.listen.mockResolvedValue(() => undefined);
  mocks.createTask.mockResolvedValue({ id: 'task-1' });
});

describe('quick-add 事件中继（V2）', () => {
  it('主窗口订阅 quick-add://submit，用当前 backend 创建任务（Engine 即本地副本）', async () => {
    initQuickAddRelay();
    const handler = await registeredHandler();

    await handler({ payload: { title: '  买牛奶  ' } });
    expect(mocks.createTask).toHaveBeenCalledWith({ title: '买牛奶' });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('空标题被忽略；创建失败以 toast 呈现（fire-and-forget 不阻塞 quick-add）', async () => {
    initQuickAddRelay();
    const handler = await registeredHandler();

    await handler({ payload: { title: '   ' } });
    expect(mocks.createTask).not.toHaveBeenCalled();

    mocks.createTask.mockRejectedValueOnce(new Error('offline'));
    await handler({ payload: { title: '断网也能进 Outbox——失败才走这里' } });
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it('非 Tauri 环境不订阅', () => {
    mocks.isTauri.mockReturnValue(false);
    initQuickAddRelay();
    expect(mocks.listen).not.toHaveBeenCalled();
  });
});

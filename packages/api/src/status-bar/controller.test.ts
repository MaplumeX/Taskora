import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StatusBarTaskInput } from './content';
import {
  createStatusBarController,
  STATUS_BAR_ENABLED_KEY,
  type StatusBarController,
} from './controller';
import type { StatusBarActionEvent, StatusBarShell } from './shell';

const NOW = new Date(2026, 8, 25, 15, 0, 0);
const TODAY = new Date(2026, 8, 25).toISOString();
const YESTERDAY = new Date(2026, 8, 24).toISOString();
const INDEX_KEY = 'taskora.statusBar.index';

/** 中文 t：断言通知文案的关键片段（避免依赖 i18n 初始化语言）。 */
const t: (key: string, options?: Record<string, unknown>) => string = (key) => {
  switch (key) {
    case 'statusbar:quickAddEntry':
      return '快速添加任务';
    default:
      return key;
  }
};

interface Harness {
  shell: StatusBarShell & {
    posted: Array<{ title: string }>;
    cleared: number;
    emitAction(event: StatusBarActionEvent): void;
  };
  created: string[];
  setTasks(tasks: StatusBarTaskInput[]): void;
  controller: StatusBarController;
}

function installHarness(options?: {
  granted?: boolean;
  tasks?: StatusBarTaskInput[];
  enabledInStorage?: boolean;
  storedIndex?: number;
}): Harness {
  const posted: Array<{ title: string }> = [];
  const created: string[] = [];
  let actionCb: ((event: StatusBarActionEvent) => void) | null = null;
  let tasks = options?.tasks ?? [];
  const shell = {
    posted,
    cleared: 0,
    isPermissionGranted: vi.fn(async () => options?.granted ?? true),
    requestPermission: vi.fn(async () => options?.granted ?? true),
    post: vi.fn(async (content: { title: string }) => {
      posted.push(content);
    }),
    clear: vi.fn(async () => {
      shell.cleared += 1;
    }),
    onAction(cb: (event: StatusBarActionEvent) => void) {
      actionCb = cb;
    },
    openSettings: vi.fn(async () => {}),
    emitAction(event: StatusBarActionEvent) {
      actionCb?.(event);
    },
  };
  if (options?.enabledInStorage !== undefined) {
    globalThis.localStorage?.setItem(STATUS_BAR_ENABLED_KEY, options.enabledInStorage ? '1' : '0');
  }
  if (options?.storedIndex !== undefined) {
    globalThis.localStorage?.setItem(INDEX_KEY, String(options.storedIndex));
  }
  const controller = createStatusBarController({
    shell,
    t,
    listTodayTasks: async () => tasks,
    createTask: async (title) => {
      created.push(title);
    },
    refreshDebounceMs: 0,
    now: () => NOW,
  });
  return {
    shell,
    created,
    setTasks(next) {
      tasks = next;
    },
    controller,
  };
}

async function flush(): Promise<void> {
  await vi.runAllTimersAsync();
}

function task(title: string, scheduledDate: string | null, sortOrder = 0): StatusBarTaskInput {
  return { title, scheduledDate, sortOrder };
}

describe('createStatusBarController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.localStorage?.removeItem(STATUS_BAR_ENABLED_KEY);
    globalThis.localStorage?.removeItem(INDEX_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.localStorage?.removeItem(STATUS_BAR_ENABLED_KEY);
    globalThis.localStorage?.removeItem(INDEX_KEY);
  });

  it('开启：权限被拒则不生效并返回 false', async () => {
    const h = installHarness({ granted: false });
    expect(await h.controller.setEnabled(true)).toBe(false);
    expect(h.controller.isEnabled()).toBe(false);
    expect(h.shell.posted).toHaveLength(0);
  });

  it('开启并登录：发布首条任务标题（多条带位置指示）', async () => {
    const h = installHarness({
      tasks: [task('今天一', TODAY, 1), task('逾期', YESTERDAY), task('今天二', TODAY, 2)],
    });
    h.controller.syncSession(true);
    expect(await h.controller.setEnabled(true)).toBe(true);
    await flush();
    // 逾期排最前
    expect(h.shell.posted.at(-1)).toEqual({ title: '9/24 · 逾期 (1/3)' });
  });

  it('无任务：发布快速添加入口标题', async () => {
    const h = installHarness({ enabledInStorage: true, tasks: [] });
    h.controller.syncSession(true);
    await flush();
    expect(h.shell.posted.at(-1)).toEqual({ title: '快速添加任务' });
  });

  it('「>」轮播：游标前进并持久化，越界回绕', async () => {
    const h = installHarness({
      enabledInStorage: true,
      tasks: [task('a', TODAY, 1), task('b', TODAY, 2), task('c', TODAY, 3)],
    });
    h.controller.syncSession(true);
    await flush();
    expect(h.shell.posted.at(-1)?.title).toBe('a (1/3)');

    h.shell.emitAction({ actionId: 'next' });
    await flush();
    expect(h.shell.posted.at(-1)?.title).toBe('b (2/3)');
    expect(globalThis.localStorage?.getItem(INDEX_KEY)).toBe('1');

    h.shell.emitAction({ actionId: 'next' });
    h.shell.emitAction({ actionId: 'next' });
    await flush();
    expect(h.shell.posted.at(-1)?.title).toBe('a (1/3)');
    expect(globalThis.localStorage?.getItem(INDEX_KEY)).toBe('0');
  });

  it('游标从 localStorage 恢复（冷启动）', async () => {
    const h = installHarness({
      enabledInStorage: true,
      storedIndex: 2,
      tasks: [task('a', TODAY, 1), task('b', TODAY, 2), task('c', TODAY, 3)],
    });
    h.controller.syncSession(true);
    await flush();
    expect(h.shell.posted.at(-1)?.title).toBe('c (3/3)');
  });

  it('quick-add：标题 trim 后落库并重发；空输入忽略', async () => {
    const h = installHarness({ enabledInStorage: true, tasks: [] });
    h.controller.syncSession(true);
    await flush();
    const before = h.shell.posted.length;

    h.shell.emitAction({ actionId: 'quick-add', inputValue: '  买牛奶  ' });
    await flush();
    expect(h.created).toEqual(['买牛奶']);
    expect(h.shell.posted.length).toBeGreaterThan(before);

    h.shell.emitAction({ actionId: 'quick-add', inputValue: '   ' });
    expect(h.created).toHaveLength(1);
  });

  it('tap / dismiss 不触发写或发布', async () => {
    const h = installHarness({ enabledInStorage: true });
    h.controller.syncSession(true);
    await flush();
    const before = h.shell.posted.length;
    h.shell.emitAction({ actionId: 'tap' });
    h.shell.emitAction({ actionId: 'dismiss' });
    await flush();
    expect(h.created).toHaveLength(0);
    expect(h.shell.posted.length).toBe(before);
  });

  it('登出撤下、登录恢复', async () => {
    const h = installHarness({ enabledInStorage: true, tasks: [task('a', TODAY)] });
    h.controller.syncSession(true);
    await flush();
    expect(h.shell.posted).toHaveLength(1);

    const clearedBefore = h.shell.cleared;
    h.controller.syncSession(false);
    expect(h.shell.cleared).toBe(clearedBefore + 1);

    h.controller.syncSession(true);
    await flush();
    expect(h.shell.posted).toHaveLength(2);
  });

  it('关闭：撤下并持久化', async () => {
    const h = installHarness({ enabledInStorage: true });
    h.controller.syncSession(true);
    await flush();
    expect(await h.controller.setEnabled(false)).toBe(true);
    expect(h.controller.isEnabled()).toBe(false);
    expect(globalThis.localStorage?.getItem(STATUS_BAR_ENABLED_KEY)).toBe('0');
    expect(h.shell.cleared).toBeGreaterThanOrEqual(1);
  });

  it('数据变更防抖刷新：标题反映最新列表（游标越界收敛）', async () => {
    const h = installHarness({
      enabledInStorage: true,
      storedIndex: 5,
      tasks: [task('a', TODAY, 1), task('b', TODAY, 2)],
    });
    h.controller.syncSession(true);
    await flush();
    // 游标 5 越界收敛回 0
    expect(h.shell.posted.at(-1)?.title).toBe('a (1/2)');
  });
});

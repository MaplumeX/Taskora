import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StatusBarTaskInput } from './content';
import {
  createStatusBarController,
  STATUS_BAR_ENABLED_KEY,
  type StatusBarController,
} from './controller';
import type { QuickAddDraft } from '../quick-add/draft';
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
    case 'statusbar:quickAddFailed':
      return '未能添加任务';
    default:
      return key;
  }
};

interface Harness {
  shell: StatusBarShell & {
    posted: Array<{ title: string }>;
    failures: Array<{ title: string; text: string }>;
    cleared: number;
    emitAction(event: StatusBarActionEvent): void;
  };
  created: QuickAddDraft[];
  setTasks(tasks: StatusBarTaskInput[]): void;
  controller: StatusBarController;
}

function installHarness(options?: {
  granted?: boolean;
  tasks?: StatusBarTaskInput[];
  enabledInStorage?: boolean;
  storedIndex?: number;
  createFails?: boolean;
  syncQuickAddData?: () => Promise<void>;
  revealTask?: (taskId: string) => void;
}): Harness {
  const posted: Array<{ title: string }> = [];
  const failures: Array<{ title: string; text: string }> = [];
  const created: QuickAddDraft[] = [];
  let actionCb: ((event: StatusBarActionEvent) => void) | null = null;
  let tasks = options?.tasks ?? [];
  const shell = {
    posted,
    failures,
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
    notifyQuickAddFailed: vi.fn(async (content: { title: string; text: string }) => {
      failures.push(content);
    }),
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
    createDraft: async (draft) => {
      if (options?.createFails) throw new Error('engine down');
      created.push(draft);
      return { taskId: `task-${created.length}` };
    },
    syncQuickAddData: options?.syncQuickAddData,
    revealTask: options?.revealTask,
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

function task(
  title: string,
  scheduledDate: string | null,
  position: string | null = 'a0',
): StatusBarTaskInput {
  return { title, scheduledDate, position };
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
      tasks: [task('今天一', TODAY, 'a1'), task('计划日期已过', YESTERDAY), task('今天二', TODAY, 'a2')],
    });
    h.controller.syncSession(true);
    expect(await h.controller.setEnabled(true)).toBe(true);
    await flush();
    // 计划日期已过排最前
    expect(h.shell.posted.at(-1)).toEqual({ title: '9/24 · 计划日期已过 (1/3)' });
  });

  it('开启等待原生发布成功后才保存已开启状态', async () => {
    const h = installHarness();
    h.controller.syncSession(true);
    let finish!: () => void;
    vi.spyOn(h.shell, 'post').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const settled = vi.fn();
    const enabling = h.controller.setEnabled(true).then(settled);
    await flush();
    expect(settled).not.toHaveBeenCalled();
    expect(globalThis.localStorage?.getItem(STATUS_BAR_ENABLED_KEY)).not.toBe('1');

    finish();
    await enabling;
    expect(settled).toHaveBeenCalledWith(true);
    expect(globalThis.localStorage?.getItem(STATUS_BAR_ENABLED_KEY)).toBe('1');
  });

  it('发布失败回滚开关并允许再次开启', async () => {
    const h = installHarness();
    h.controller.syncSession(true);
    vi.spyOn(h.shell, 'post').mockRejectedValueOnce(new Error('native failure'));

    await expect(h.controller.setEnabled(true)).rejects.toThrow('native failure');
    expect(h.controller.isEnabled()).toBe(false);
    expect(globalThis.localStorage?.getItem(STATUS_BAR_ENABLED_KEY)).toBe('0');
    expect(h.shell.cleared).toBeGreaterThan(0);

    expect(await h.controller.setEnabled(true)).toBe(true);
    expect(h.shell.posted.at(-1)).toEqual({ title: '快速添加任务' });
  });

  it('后台发布失败保留偏好，下次刷新可重试', async () => {
    const h = installHarness({ enabledInStorage: true });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(h.shell, 'post').mockRejectedValueOnce(new Error('native failure'));
    h.controller.syncSession(true);
    await flush();
    expect(warning).toHaveBeenCalled();
    expect(h.controller.isEnabled()).toBe(true);

    h.controller.scheduleRefresh();
    await flush();
    expect(h.shell.posted.at(-1)).toEqual({ title: '快速添加任务' });
    warning.mockRestore();
  });

  it('关闭发生在发布期间时，在飞通知完成后再次撤下', async () => {
    const h = installHarness();
    h.controller.syncSession(true);
    let finish!: () => void;
    vi.spyOn(h.shell, 'post').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const enabling = h.controller.setEnabled(true);
    await flush();
    await h.controller.setEnabled(false);
    const clearedBefore = h.shell.cleared;
    finish();
    expect(await enabling).toBe(false);
    expect(h.shell.cleared).toBe(clearedBefore + 1);
    expect(globalThis.localStorage?.getItem(STATUS_BAR_ENABLED_KEY)).toBe('0');
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
      tasks: [task('a', TODAY, 'a1'), task('b', TODAY, 'a2'), task('c', TODAY, 'a3')],
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
      tasks: [task('a', TODAY, 'a1'), task('b', TODAY, 'a2'), task('c', TODAY, 'a3')],
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
    expect(h.created).toEqual([{ title: '买牛奶' }]);
    expect(h.shell.posted.length).toBeGreaterThan(before);

    h.shell.emitAction({ actionId: 'quick-add', inputValue: '   ' });
    expect(h.created).toHaveLength(1);
  });

  it('quick-add：草稿 JSON 解析后整份落库', async () => {
    const h = installHarness({ enabledInStorage: true, tasks: [] });
    h.controller.syncSession(true);
    await flush();

    h.shell.emitAction({
      actionId: 'quick-add',
      inputValue: JSON.stringify({ title: '写周报', when: { type: 'someday' }, tagIds: ['t1'] }),
    });
    await flush();
    expect(h.created).toEqual([{ title: '写周报', when: { type: 'someday' }, tagIds: ['t1'] }]);
  });

  it('quick-add：落库失败发系统通知（正文为标题），之后照常刷新', async () => {
    const h = installHarness({ enabledInStorage: true, tasks: [], createFails: true });
    h.controller.syncSession(true);
    await flush();
    const before = h.shell.posted.length;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    h.shell.emitAction({ actionId: 'quick-add', inputValue: '{"title":" 买牛奶 "}' });
    await flush();
    expect(h.shell.failures).toEqual([{ title: '未能添加任务', text: '买牛奶' }]);
    expect(h.shell.posted.length).toBeGreaterThan(before);
    warn.mockRestore();
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
      tasks: [task('a', TODAY, 'a1'), task('b', TODAY, 'a2')],
    });
    h.controller.syncSession(true);
    await flush();
    // 游标 5 越界收敛回 0
    expect(h.shell.posted.at(-1)?.title).toBe('a (1/2)');
  });

  it('快速添加数据快照：每次发布后同步；未生效时不同步；失败不影响通知', async () => {
    const sync = vi.fn(async () => {});
    const h = installHarness({ enabledInStorage: true, tasks: [], syncQuickAddData: sync });
    await flush();
    expect(sync).not.toHaveBeenCalled(); // 未登录

    h.controller.syncSession(true);
    await flush();
    expect(sync).toHaveBeenCalledTimes(1);

    h.controller.scheduleRefresh();
    await flush();
    expect(sync).toHaveBeenCalledTimes(2);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sync.mockRejectedValueOnce(new Error('plugin missing'));
    const before = h.shell.posted.length;
    h.controller.scheduleRefresh();
    await flush();
    expect(h.shell.posted.length).toBe(before + 1);
    warn.mockRestore();
  });

  it('quick-add：openInApp 的提交落库后定位到新任务；普通提交不定位', async () => {
    const revealTask = vi.fn();
    const h = installHarness({ enabledInStorage: true, tasks: [], revealTask });
    h.controller.syncSession(true);
    await flush();

    h.shell.emitAction({ actionId: 'quick-add', inputValue: '{"title":"普通"}' });
    h.shell.emitAction({
      actionId: 'quick-add',
      inputValue: '{"title":"继续编辑","openInApp":true}',
    });
    await flush();
    expect(h.created).toEqual([{ title: '普通' }, { title: '继续编辑' }]);
    expect(revealTask).toHaveBeenCalledTimes(1);
    expect(revealTask).toHaveBeenCalledWith('task-2');
  });
});

/**
 * 状态栏常驻通知控制器（android-status-bar，滴答清单形态）。
 *
 * 形态：折叠态单行 ongoing 通知——标题显示当前一条未完成任务，
 * action「>」切换下一条（轮播游标原生冷启动后由 JS 恢复，见下）、
 * action「+」通知内输入快速添加（RemoteInput）。
 *
 * 职责：开关持久化、会话跟随（登录才发布）、任务列表与轮播游标、
 * 数据变更防抖刷新、动作处理。系统 API 全部走 StatusBarShell，任务
 * 读写由装配侧注入（mobile 转发 currentTaskBackend）。
 *
 * 已知边界（research.md）：点按动作会拉起主 Activity；进程死后内容
 * 冻结、重启后通知消失；Android 14+ 用户可划掉（'dismiss'，尊重用
 * 户不立即重发，下次数据变更/进前台自然恢复）。
 */

import { carouselTitle, sortStatusBarTasks, type StatusBarTaskInput } from './content';
import type { StatusBarShell } from './shell';

export const STATUS_BAR_ENABLED_KEY = 'taskora.statusBar.enabled';
const STATUS_BAR_INDEX_KEY = 'taskora.statusBar.index';

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export interface StatusBarControllerOptions {
  shell: StatusBarShell;
  t: TranslateFn;
  /** Today 口径未完成任务（计划日期 ≤ 今天，含逾期）。 */
  listTodayTasks(): Promise<StatusBarTaskInput[]>;
  /** 快速添加落库（默认进 Inbox，由后端默认口径决定）。 */
  createTask(title: string): Promise<void>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** 数据变更后的刷新防抖（默认 500ms；测试可设 0）。 */
  refreshDebounceMs?: number;
  now?: () => Date;
}

export interface StatusBarController {
  isEnabled(): boolean;
  /**
   * 设置开关。开启时确保通知权限（未授权先请求；被拒则不开并返回
   * false，由 UI 引导去系统设置）。返回最终生效状态。
   */
  setEnabled(next: boolean): Promise<boolean>;
  /** 会话跟随：登录（active=true）时按开关发布/恢复；登出时撤下。幂等。 */
  syncSession(active: boolean): void;
  /** 数据变更后的防抖刷新（仅生效状态下真正发通知）。 */
  scheduleRefresh(): void;
  destroy(): void;
}

export function createStatusBarController(
  options: StatusBarControllerOptions,
): StatusBarController {
  const storage = options.storage ?? globalThis.localStorage;
  const now = options.now ?? (() => new Date());
  const debounceMs = options.refreshDebounceMs ?? 500;

  let enabled = storage?.getItem(STATUS_BAR_ENABLED_KEY) === '1';
  let sessionActive = false;
  let destroyed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshInFlight = false;
  let refreshPending = false;

  // 轮播状态：当前已排序任务列表 + 游标（游标持久化，冷启动恢复）。
  let tasks: StatusBarTaskInput[] = [];
  let index = readIndex();

  function readIndex(): number {
    const raw = storage?.getItem(STATUS_BAR_INDEX_KEY);
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function persistIndex(): void {
    storage?.setItem(STATUS_BAR_INDEX_KEY, String(index));
  }

  const effectiveActive = () => enabled && sessionActive && !destroyed;

  /** 覆盖式发布常驻通知（固定 id 由 shell 侧保证）。 */
  async function postCurrent(): Promise<void> {
    const title =
      tasks.length === 0
        ? options.t('statusbar:quickAddEntry')
        : carouselTitle(tasks, index, now());
    await options.shell.post({ title });
  }

  /** 拉取最新任务并发布。并发合并：在飞期间到的刷新只补跑一次。 */
  async function refreshNow(): Promise<void> {
    if (!effectiveActive()) return;
    if (refreshInFlight) {
      refreshPending = true;
      return;
    }
    refreshInFlight = true;
    try {
      do {
        refreshPending = false;
        tasks = sortStatusBarTasks(await options.listTodayTasks());
        if (index >= tasks.length) {
          index = 0;
          persistIndex();
        }
        await postCurrent();
      } while (refreshPending && effectiveActive());
    } catch {
      // 读取/发布失败静默：下次数据变更或进前台时自然重试。
    } finally {
      refreshInFlight = false;
    }
  }

  function scheduleRefresh(): void {
    if (!effectiveActive()) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refreshNow();
    }, debounceMs);
  }

  options.shell.onAction((event) => {
    if (destroyed) return;
    if (event.actionId === 'quick-add') {
      const title = event.inputValue?.trim();
      if (!title) return;
      // 落库后引擎 onChange 会再触发一次防抖刷新；这里立即刷新是为了
      // 在系统因动作撤下可见通知后立刻补回（插件行为：动作即 dismiss）。
      void options
        .createTask(title)
        .catch(() => undefined)
        .then(() => void refreshNow());
    } else if (event.actionId === 'next') {
      if (tasks.length === 0) return;
      index = (index + 1) % tasks.length;
      persistIndex();
      void postCurrent();
    }
    // 'tap'：系统已拉起 Activity，无操作。'dismiss'：尊重用户，不重发。
  });

  return {
    isEnabled: () => enabled,
    async setEnabled(next) {
      if (next) {
        let granted = await options.shell.isPermissionGranted().catch(() => false);
        if (!granted) {
          granted = await options.shell.requestPermission().catch(() => false);
        }
        if (!granted) return false;
        enabled = true;
        storage?.setItem(STATUS_BAR_ENABLED_KEY, '1');
        if (effectiveActive()) void refreshNow();
        return true;
      }
      enabled = false;
      storage?.setItem(STATUS_BAR_ENABLED_KEY, '0');
      await options.shell.clear().catch(() => undefined);
      return true;
    },
    syncSession(active) {
      if (active === sessionActive) return;
      sessionActive = active;
      if (!active) {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        void options.shell.clear().catch(() => undefined);
      } else if (effectiveActive()) {
        void refreshNow();
      }
    },
    scheduleRefresh,
    destroy() {
      destroyed = true;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    },
  };
}

let current: StatusBarController | null = null;

/**
 * 注册/注销当前控制器（mobile init 时调用）。设置页（@taskora/ui）经
 * currentStatusBarController 读取开关状态——与 setTaskBackend 同一注入
 * 惯例，未注册（web/desktop）时设置页不渲染开关。
 */
export function registerStatusBarController(next: StatusBarController | null): void {
  current = next;
}

export function currentStatusBarController(): StatusBarController | null {
  return current;
}

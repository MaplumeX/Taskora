/**
 * 状态栏常驻通知装配（android-status-bar，滴答清单形态）。
 *
 * 在 main.tsx 与 initMobileEngine 并列调用：创建 Tauri 薄壳 + 平台
 * 无关控制器，注入任务读写（转发 currentTaskBackend——Engine 装配后
 * 走本地副本，未装配/登录前走 REST，本模块不感知差异）。
 *
 * 刷新触发点：启动、Engine 数据变更（mobile-engine 调
 * scheduleStatusBarRefresh，防抖合并在控制器内）、回前台（跨天口径
 * 滚动 + 恢复被划掉的通知）。
 */

import {
  createStatusBarController,
  currentTaskBackend,
  i18n,
  registerStatusBarController,
  setStatusBarShell,
  useAuthStore,
  type StatusBarController,
  type StatusBarTaskInput,
} from '@taskora/api';

import { isTauriRuntime } from '../engine/tauri-storage';
import { createTauriStatusBarShell } from './tauri-shell';

let controller: StatusBarController | null = null;
let unsubscribeAuth: (() => void) | null = null;

export function initStatusBar(): void {
  if (!isTauriRuntime() || controller) return;

  const shell = createTauriStatusBarShell();
  setStatusBarShell(shell);

  controller = createStatusBarController({
    shell,
    t: (key, options) => i18n.t(key, options),
    listTodayTasks: async (): Promise<StatusBarTaskInput[]> => {
      const tasks = await currentTaskBackend().getTasks({ view: 'today' });
      return tasks.map((task) => ({
        title: task.title,
        scheduledDate: task.scheduledDate,
        sortOrder: task.sortOrder,
      }));
    },
    createTask: async (title) => {
      await currentTaskBackend().createTask({ title });
    },
  });
  registerStatusBarController(controller);

  // 会话跟随：登录时按开关发布/恢复；登出时撤下（用户数据不再暴露
  // 在系统通知栏）。
  const isLoggedIn = () => {
    const state = useAuthStore.getState();
    return !!state.token && !!state.user;
  };
  unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    const loggedIn = !!state.token && !!state.user;
    const wasLoggedIn = !!previous.token && !!previous.user;
    if (loggedIn !== wasLoggedIn) controller?.syncSession(loggedIn);
  });
  controller.syncSession(isLoggedIn());

  // 回前台：跨天/时区变化重算；动作 dismiss 后借此自然恢复。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') controller?.scheduleRefresh();
  });
}

/** Engine 数据变更后的防抖刷新（mobile-engine 的 onChange 钩子调用）。 */
export function scheduleStatusBarRefresh(): void {
  controller?.scheduleRefresh();
}

/** 测试专用：重置模块级装配状态。 */
export function __resetStatusBarForTest(): void {
  unsubscribeAuth?.();
  unsubscribeAuth = null;
  controller?.destroy();
  controller = null;
  registerStatusBarController(null);
  setStatusBarShell(null);
}

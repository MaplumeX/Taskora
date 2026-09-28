import { create } from 'zustand';

/**
 * Reveal Task 请求的投递口（reminder-actions spec）：平台壳（桌面通知
 * 事件 / Android 通知启动意图）在 React 树之外调用 requestTaskReveal，
 * AppShell 内的 useTaskRevealListener 取走并执行。请求可能早于 AppShell
 * 挂载（从通知冷启动），因此以待处理状态保存而非一次性事件。
 */
interface TaskRevealState {
  pendingTaskId: string | null;
  request: (taskId: string) => void;
  take: () => string | null;
}

export const useTaskRevealStore = create<TaskRevealState>()((set, get) => ({
  pendingTaskId: null,
  request: (taskId) => set({ pendingTaskId: taskId }),
  take: () => {
    const taskId = get().pendingTaskId;
    if (taskId !== null) set({ pendingTaskId: null });
    return taskId;
  },
}));

export function requestTaskReveal(taskId: string): void {
  useTaskRevealStore.getState().request(taskId);
}

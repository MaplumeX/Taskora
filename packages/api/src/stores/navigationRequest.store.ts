import { create } from 'zustand';

/**
 * 平台壳投递的路由请求（android-status-bar issue 03）：点击状态栏常驻
 * 通知应落到 Today。Android 的通知点按意图在 React 树之外到达（冷启动
 * 时 JS 尚未挂载），因此以待处理状态保存，AppShell 内的
 * useNavigationRequestListener 取走并导航——与 taskReveal.store 同一
 * 「壳投递、Router 内消费」模式。
 */
interface NavigationRequestState {
  pendingPath: string | null;
  request: (path: string) => void;
  take: () => string | null;
}

export const useNavigationRequestStore = create<NavigationRequestState>()((set, get) => ({
  pendingPath: null,
  request: (path) => set({ pendingPath: path }),
  take: () => {
    const path = get().pendingPath;
    if (path !== null) set({ pendingPath: null });
    return path;
  },
}));

/** 请求导航到某个应用内路由（可早于 Router 挂载调用）。 */
export function requestNavigation(path: string): void {
  useNavigationRequestStore.getState().request(path);
}

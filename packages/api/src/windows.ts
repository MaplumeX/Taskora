/**
 * 多窗口注入点（.scratch/multi-window，对齐 Things 3 Mac）。只有桌面壳注入
 * 实现（新建副窗口并打开该路由）；web / Android 不注入，UI 据此隐藏「在新
 * 窗口中打开」，⌥ + 点击退化为普通导航。
 */
export type WindowOpener = (route: string) => void;

let opener: WindowOpener | null = null;

export function setWindowOpener(next: WindowOpener | null): void {
  opener = next;
}

/** 宿主能否开新窗口（注入在挂载前完成，之后不变，组件可直接读）。 */
export function canOpenWindows(): boolean {
  return opener !== null;
}

/** 在新窗口打开路由；未注入时返回 false，调用方自行退化。 */
export function openInNewWindow(route: string): boolean {
  if (!opener) return false;
  opener(route);
  return true;
}

import { openInNewWindow } from '@taskora/api';

/**
 * ⌥ / Alt + 点击「前往 / 在项目中显示」：在新窗口打开（对齐 Things 3 Mac，
 * .scratch/multi-window）。宿主不能开窗口或没按 ⌥ 时在当前窗口导航。
 */
export function navigateOrOpenWindow(
  navigate: (route: string) => void,
  route: string,
  event?: { altKey: boolean },
): void {
  if (event?.altKey && openInNewWindow(route)) return;
  navigate(route);
}

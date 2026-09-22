/**
 * 键盘避让（issue 05）：虚拟键盘弹出时输入框与 FAB 正确避让。
 *
 * Android WebView 默认没有 adjustResize（Tauri 生成的 AndroidManifest
 * 未设置 windowSoftInputMode），`dvh` 不随 IME 变化。用 visualViewport
 * API 把「被键盘遮住的高度」写进 `--kb-inset` CSS 变量：
 * - ui 的 AppShell / MobileTabBar / MobileFab 消费该变量（默认 0，web /
 *   desktop 不受影响）；
 * - 若宿主确实配置了 adjustResize（布局视口同步收缩），公式自然归零，
 *   不会双重避让。
 */

/** 计算 visualViewport 被键盘占用的像素高度。 */
export function computeKeyboardInset(
  layoutViewportHeight: number,
  visualViewport: { height: number; offsetTop: number },
): number {
  const occluded = layoutViewportHeight - visualViewport.height - visualViewport.offsetTop;
  return Math.max(0, Math.round(occluded));
}

/** 安装监听；返回清理函数（测试与热替换用）。 */
export function installKeyboardInset(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;

  const update = () => {
    const inset = computeKeyboardInset(window.innerHeight, viewport);
    document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
  };

  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  update();

  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    document.documentElement.style.removeProperty('--kb-inset');
  };
}

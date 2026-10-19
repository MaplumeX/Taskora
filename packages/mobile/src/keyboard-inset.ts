/**
 * 键盘避让（issue 05）：虚拟键盘弹出时输入框与 FAB 正确避让。
 *
 * Android WebView 默认没有 adjustResize（Tauri 生成的 AndroidManifest
 * 未设置 windowSoftInputMode），`dvh` 不随 IME 变化。用 visualViewport
 * API 把「被键盘遮住的高度」写进 `--kb-inset` CSS 变量：
 * - ui 的 AppShell / MobileFab / SyncIndicator 消费该变量（默认 0，web /
 *   desktop 不受影响）；
 * - 若宿主确实配置了 adjustResize（布局视口同步收缩），公式自然归零，
 *   不会双重避让。
 *
 * 写入节奏：键盘升降动画期间 visualViewport 几乎每帧 resize，逐帧改根
 * 元素变量会让整页重算样式、AppShell 重排，与同时播放的弹窗 / 展开动画
 * 抢主线程而掉帧。因此：
 * - resize / scroll 等视口稳定（KEYBOARD_SETTLE_MS 内无新事件）后只写一次；
 * - 焦点离开可编辑元素且没有落到另一个可编辑元素上时，键盘必然收起，
 *   立即写 0（弹窗打开、任务收起等场景不必等键盘动画结束才回到全高）。
 */

/** 视口停止变化多久后视为键盘动画结束。 */
export const KEYBOARD_SETTLE_MS = 120;

/** 计算 visualViewport 被键盘占用的像素高度。 */
export function computeKeyboardInset(
  layoutViewportHeight: number,
  visualViewport: { height: number; offsetTop: number },
): number {
  const occluded = layoutViewportHeight - visualViewport.height - visualViewport.offsetTop;
  return Math.max(0, Math.round(occluded));
}

/** 获得焦点时会唤起虚拟键盘的元素。 */
export function isKeyboardTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !NON_TEXT_INPUT_TYPES.has(el.type);
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** 安装监听；返回清理函数（测试与热替换用）。 */
export function installKeyboardInset(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;

  const root = document.documentElement;
  let current: number | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const write = (inset: number) => {
    if (inset === current) return;
    current = inset;
    root.style.setProperty('--kb-inset', `${inset}px`);
  };
  const measure = () => computeKeyboardInset(window.innerHeight, viewport);

  const scheduleUpdate = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => write(measure()), KEYBOARD_SETTLE_MS);
  };

  const onFocusOut = (event: FocusEvent) => {
    if (!isKeyboardTarget(event.target) || isKeyboardTarget(event.relatedTarget)) return;
    // 窗口失焦（切后台）也会触发 focusout，此时键盘未必收起
    if (!document.hasFocus()) return;
    clearTimeout(settleTimer);
    write(0);
  };

  viewport.addEventListener('resize', scheduleUpdate);
  viewport.addEventListener('scroll', scheduleUpdate);
  document.addEventListener('focusout', onFocusOut);
  write(measure());

  return () => {
    clearTimeout(settleTimer);
    viewport.removeEventListener('resize', scheduleUpdate);
    viewport.removeEventListener('scroll', scheduleUpdate);
    document.removeEventListener('focusout', onFocusOut);
    root.style.removeProperty('--kb-inset');
  };
}

/**
 * 触感反馈注入点（对齐 Things 3 iPhone 的手势触感）。共享 UI 在手势的
 * 关键时刻调用 `haptic(kind)`；只有 Android 壳注入实现（原生
 * performHapticFeedback，跟随系统触感设置），web / 桌面保持 no-op。
 *
 * - tick：滑动越过触发阈值（左滑多选 / 右滑计划 / 下拉查找）。
 * - lift：长按拖起一行、按住拖出 Magic Plus。
 * - drop：拖拽松手落位。
 * - confirm：摇一摇撤销完成。
 */
export type HapticKind = 'tick' | 'lift' | 'drop' | 'confirm';

export type HapticsImpl = (kind: HapticKind) => void;

let impl: HapticsImpl | null = null;

export function setHaptics(next: HapticsImpl | null): void {
  impl = next;
}

/** 触发一次触感；未注入或原生调用失败时静默（触感只是点缀，不影响手势本身）。 */
export function haptic(kind: HapticKind): void {
  try {
    impl?.(kind);
  } catch {
    // 忽略
  }
}

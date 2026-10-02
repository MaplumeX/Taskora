import * as React from 'react';

export interface LongPressOptions {
  /** 按住多久后触发（毫秒），默认 500。 */
  delay?: number;
  /** 触发前允许的移动距离（像素），超过则视为手势取消，默认 8。 */
  tolerance?: number;
}

export interface LongPressHandlers {
  onPointerDown: React.PointerEventHandler;
  onPointerMove: React.PointerEventHandler;
  onPointerUp: React.PointerEventHandler;
  onPointerCancel: React.PointerEventHandler;
  /** 长按触发后的同一次抬手不再产生 click（避免误触发行内点击）。 */
  onClickCapture: React.MouseEventHandler;
}

/**
 * 触屏长按手势（移动端上下文菜单入口）。
 *
 * - 仅响应 `pointerType === 'touch' | 'pen'`：桌面端长按鼠标不触发
 *   （右键 onContextMenu 已覆盖）。
 * - 按住 `delay` 毫秒且移动不超过 `tolerance` 时，以按下坐标回调
 *   （与右键菜单共用 virtual anchor）。
 * - 触发后抑制该次指针序列的 click（capture 阶段拦截），防止抬手
 *   误触发行展开/导航。
 * - 多指触摸只跟踪第一根手指（按 pointerId 匹配）。
 */
export function useLongPress(
  onLongPress: (point: { x: number; y: number }) => void,
  { delay = 500, tolerance = 8 }: LongPressOptions = {},
): LongPressHandlers {
  const timerRef = React.useRef<number | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);
  const originRef = React.useRef<{ x: number; y: number } | null>(null);
  const firedRef = React.useRef(false);
  // 保持回调最新而不重新挂载 handlers。
  const onLongPressRef = React.useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pointerIdRef.current = null;
    originRef.current = null;
  };

  // 卸载时清理计时器，避免卸载后回调触发 setState。
  React.useEffect(() => clear, []);

  const isTracking = (e: React.PointerEvent) =>
    pointerIdRef.current !== null && e.pointerId === pointerIdRef.current;

  return {
    onPointerDown(e) {
      // 鼠标交给右键菜单；非主键（如触控笔橡皮擦侧键）忽略。
      if (e.pointerType === 'mouse' || e.button !== 0) return;
      // 已有手指在计时，忽略后续手指。
      if (pointerIdRef.current !== null) return;
      firedRef.current = false;
      pointerIdRef.current = e.pointerId;
      originRef.current = { x: e.clientX, y: e.clientY };
      const origin = originRef.current;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        originRef.current = null;
        pointerIdRef.current = null;
        firedRef.current = true;
        onLongPressRef.current(origin);
      }, delay);
    },
    onPointerMove(e) {
      if (!isTracking(e) || !originRef.current) return;
      const dx = e.clientX - originRef.current.x;
      const dy = e.clientY - originRef.current.y;
      if (dx * dx + dy * dy > tolerance * tolerance) clear();
    },
    onPointerUp(e) {
      if (isTracking(e)) clear();
    },
    onPointerCancel(e) {
      if (isTracking(e)) clear();
    },
    onClickCapture(e) {
      if (!firedRef.current) return;
      firedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

// 最近一次按下的指针类型（全局 capture 监听）。Android WebView 在触屏
// 连点标题（展开后在输入框内双击/三击选词）时，会因文本选择派发
// contextmenu，而这类事件的 pointerType 不是 'touch'、sourceCapabilities
// 也可能为空，单看事件本身无法识别；用最近一次 pointerdown 兜底。
// 鼠标右键前总会先有一次 mouse pointerdown，因此混合设备上不会误伤。
let lastPointerType: string | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointerType = e.pointerType;
    },
    { capture: true, passive: true },
  );
}

/**
 * 该次 contextmenu 事件是否由触屏产生（Android WebView / Chrome 在
 * 长按、触屏选词时也会派发 contextmenu）。可拖拽的行上长按只负责拖动，
 * 这类事件应只 preventDefault、不开菜单；鼠标右键不受影响。
 */
export function isTouchContextMenu(e: React.MouseEvent): boolean {
  const native = e.nativeEvent as MouseEvent & {
    pointerType?: string;
    sourceCapabilities?: { firesTouchEvents?: boolean } | null;
  };
  if (native.pointerType === 'touch' || native.pointerType === 'pen') return true;
  if (native.sourceCapabilities?.firesTouchEvents === true) return true;
  return lastPointerType === 'touch' || lastPointerType === 'pen';
}

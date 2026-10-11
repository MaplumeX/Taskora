import * as React from 'react';

import { haptic } from '@taskora/api';

export interface PullToFindOptions {
  /** 为 false 时不响应手势。默认 true。 */
  enabled?: boolean;
  /** 指示器露出多高（像素）后松手即触发，默认 64。 */
  threshold?: number;
  /** 指示器最多露出的高度（像素），默认 96。 */
  maxDistance?: number;
  /**
   * 按下后超过该时长（毫秒）才开始下拉则不认作下拉：此时长按拖拽
   * （TouchSensor delay 300ms）即将或已经接管，默认 250（与左滑同口径）。
   */
  lockAfter?: number;
}

/** 手势方向判定前允许的抖动距离（像素），与 useSwipeToSelect 同口径。 */
const SLOP = 8;
/** 跟手阻尼：指示器只露出手指移动距离的一半。 */
const RESISTANCE = 0.5;

/**
 * 列表顶部下拉打开 Quick Find（对齐 Things 3 iPhone）。
 *
 * - 用 touch 事件而非 pointer 事件：任务行是 `touch-action: pan-y`，纵向
 *   平移一开始浏览器就会发 pointercancel，touch 事件则持续派发。监听器为
 *   passive，不阻止原生滚动与回弹。
 * - 只在按下时与判定时滚动容器都位于顶部、且主方向为向下时才进入下拉；
 *   其余情况整次手势放弃，交给原生滚动 / 左滑多选。
 * - 与长按拖拽互斥：拖拽要先按住不动 300ms，下拉必须在 `lockAfter` 之内
 *   开始移动；移动越过 SLOP 也会让 TouchSensor 的激活计时失效。
 * - 松手时露出高度 ≥ threshold 触发回调，指示器收回。
 */
export function usePullToFind(
  scrollRef: React.RefObject<HTMLElement | null>,
  onPull: () => void,
  { enabled = true, threshold = 64, maxDistance = 96, lockAfter = 250 }: PullToFindOptions = {},
) {
  const [distance, setDistance] = React.useState(0);
  const onPullRef = React.useRef(onPull);
  onPullRef.current = onPull;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    let gesture: { x: number; y: number; t: number; pulling: boolean } | null = null;
    let current = 0;
    const move = (next: number) => {
      // 越过触发阈值的那一刻给一次轻触感（同左滑 / 右滑）。
      if (current < threshold && next >= threshold) haptic('tick');
      current = next;
      setDistance(next);
    };
    const reset = () => {
      gesture = null;
      if (current !== 0) move(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || el.scrollTop > 0) {
        reset();
        return;
      }
      const touch = e.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, t: Date.now(), pulling: false };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!gesture) return;
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.pulling) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        const down = dy > 0 && Math.abs(dy) > Math.abs(dx);
        if (!down || el.scrollTop > 0 || Date.now() - gesture.t > lockAfter) {
          gesture = null;
          return;
        }
        gesture.pulling = true;
      }
      move(Math.min(maxDistance, Math.max(0, dy) * RESISTANCE));
    };
    const onTouchEnd = () => {
      if (gesture?.pulling && current >= threshold) onPullRef.current();
      reset();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', reset);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', reset);
      reset();
    };
  }, [scrollRef, enabled, threshold, maxDistance, lockAfter]);

  return {
    /** 指示器当前露出的高度（≥ 0）。 */
    distance,
    /** 已越过阈值：松手即触发，用于指示器高亮。 */
    armed: distance >= threshold,
  };
}

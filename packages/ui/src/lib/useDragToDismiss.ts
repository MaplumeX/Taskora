import * as React from 'react';

import { haptic } from '@taskora/api';

export interface DragToDismissOptions {
  /** 为 false 时不响应手势。默认 true。 */
  enabled?: boolean;
  /** 下拉超过该距离（像素）松手即关闭，默认 80。 */
  threshold?: number;
  /** 松手时向下速度超过该值（像素/毫秒）也关闭（快速下甩），默认 0.5。 */
  flickVelocity?: number;
}

/** 手势方向判定前允许的抖动距离（像素），与 usePullToFind 同口径。 */
const SLOP = 8;

/**
 * 底部面板下拉关闭（对齐 iOS sheet）：面板跟手下移，越过阈值或快速下甩
 * 松手即关闭，否则弹回。
 *
 * - 用 touch 事件而非 pointer 事件：面板里的整行按钮没有 touch-action
 *   限制，纵向移动一开始浏览器就会发 pointercancel，touch 事件则持续派发。
 * - 只在主方向为向下时进入下拉；向上或横向的手势整次放弃。
 * - 拖动过的那次手势吞掉随后的 click，避免松手处的按钮被误触发。
 * - 关闭后 `offset` 保持在松手位置，供退场动画从该处继续滑出。
 */
export function useDragToDismiss(
  ref: React.RefObject<HTMLElement | null>,
  onDismiss: () => void,
  { enabled = true, threshold = 80, flickVelocity = 0.5 }: DragToDismissOptions = {},
) {
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const onDismissRef = React.useRef(onDismiss);
  onDismissRef.current = onDismiss;

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let gesture: {
      x: number;
      y: number;
      dragging: boolean;
      lastY: number;
      lastT: number;
      velocity: number;
    } | null = null;
    let current = 0;
    let swallowClick = false;
    const move = (next: number) => {
      // 越过关闭阈值的那一刻给一次轻触感（同下拉查找）。
      if (current < threshold && next >= threshold) haptic('tick');
      current = next;
      setOffset(next);
    };
    const reset = () => {
      gesture = null;
      setDragging(false);
      if (current !== 0) move(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      const touch = e.touches[0];
      const now = Date.now();
      gesture = {
        x: touch.clientX,
        y: touch.clientY,
        dragging: false,
        lastY: touch.clientY,
        lastT: now,
        velocity: 0,
      };
      swallowClick = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!gesture) return;
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.dragging) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        if (!(dy > 0 && Math.abs(dy) > Math.abs(dx))) {
          gesture = null;
          return;
        }
        gesture.dragging = true;
        swallowClick = true;
        setDragging(true);
      }
      const now = Date.now();
      const dt = now - gesture.lastT;
      if (dt > 0) gesture.velocity = (touch.clientY - gesture.lastY) / dt;
      gesture.lastY = touch.clientY;
      gesture.lastT = now;
      move(Math.max(0, dy));
    };
    const onTouchEnd = () => {
      if (gesture?.dragging && (current >= threshold || gesture.velocity >= flickVelocity)) {
        gesture = null;
        setDragging(false);
        setDismissed(true);
        onDismissRef.current();
        return;
      }
      reset();
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', reset);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', reset);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, [ref, enabled, threshold, flickVelocity]);

  return {
    /** 面板当前下移的距离（≥ 0）。 */
    offset,
    /** 手指正在拖动：跟手期间应关掉过渡。 */
    dragging,
    /** 已由下拉关闭：退场动画应从 offset 处继续向下滑出。 */
    dismissed,
  };
}

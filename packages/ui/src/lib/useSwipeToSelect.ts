import * as React from 'react';

import { haptic } from '@taskora/api';

export interface SwipeToSelectOptions {
  /** 为 false 时不响应左滑（如该列表不支持多选）。默认 true。 */
  enabled?: boolean;
  /**
   * 右滑松手的回调（任务行：打开计划卡片，对齐 Things 3 iPhone）。缺省
   * 时右滑不认作手势，照旧放弃交给列表。
   */
  onSwipeRight?: () => void;
  /** 横滑超过多少像素后松手即触发，默认 64。 */
  threshold?: number;
  /** 行最多跟手横移的距离（像素），默认 88。 */
  maxOffset?: number;
  /**
   * 按下后超过该时长（毫秒）才开始横向移动则不认作横滑：此时长按拖拽
   * （TouchSensor delay 300ms）即将或已经接管，默认 250。
   */
  lockAfter?: number;
}

export interface SwipeToSelectHandlers {
  onPointerDown: React.PointerEventHandler;
  onPointerMove: React.PointerEventHandler;
  onPointerUp: React.PointerEventHandler;
  onPointerCancel: React.PointerEventHandler;
  /** 横滑松手后的同一次抬手不再产生 click（避免误触发行展开）。 */
  onClickCapture: React.MouseEventHandler;
}

/** 手势方向判定前允许的抖动距离（像素），与 TouchSensor tolerance 同口径。 */
const SLOP = 8;

/**
 * 触屏横滑（对齐 Things 3 iPhone）：左滑进入多选，可选右滑（任务行打开
 * 计划卡片）。
 *
 * - 仅响应 `pointerType === 'touch' | 'pen'`，鼠标不触发。
 * - 越过 SLOP 后按主方向锁定：横向且该方向有回调 → 跟手横移；纵向或
 *   该方向没有回调 → 放弃，交给列表滚动。行需配 `touch-action: pan-y`，
 *   横向移动才不会被浏览器当作平移手势吞掉。
 * - 与长按拖拽互斥：拖拽需要先按住不动 300ms，而横滑必须在 `lockAfter`
 *   之内开始移动；横滑越过 SLOP 也会让 TouchSensor 的激活计时失效。
 * - 越过 threshold 的那一刻给一次轻触感；松手时横移 ≥ threshold 触发对应
 *   方向的回调，行回弹归位。
 */
export function useSwipeToSelect(
  onSwipe: () => void,
  {
    enabled = true,
    onSwipeRight,
    threshold = 64,
    maxOffset = 88,
    lockAfter = 250,
  }: SwipeToSelectOptions = {},
) {
  const [offset, setOffset] = React.useState(0);
  const gestureRef = React.useRef<{
    pointerId: number;
    x: number;
    y: number;
    t: number;
    direction: 'left' | 'right' | null;
  } | null>(null);
  const offsetRef = React.useRef(0);
  const suppressClickRef = React.useRef(false);
  const onSwipeRef = React.useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const onSwipeRightRef = React.useRef(onSwipeRight);
  onSwipeRightRef.current = onSwipeRight;
  const rightEnabled = !!onSwipeRight;

  const move = (next: number) => {
    const wasArmed = Math.abs(offsetRef.current) >= threshold;
    offsetRef.current = next;
    setOffset(next);
    if (!wasArmed && Math.abs(next) >= threshold) haptic('tick');
  };

  const reset = () => {
    gestureRef.current = null;
    if (offsetRef.current !== 0) move(0);
  };

  const isTracking = (e: React.PointerEvent) => gestureRef.current?.pointerId === e.pointerId;

  const handlers: SwipeToSelectHandlers = {
    onPointerDown(e) {
      if ((!enabled && !rightEnabled) || e.pointerType === 'mouse' || e.button !== 0) return;
      if (gestureRef.current) return;
      suppressClickRef.current = false;
      gestureRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        direction: null,
      };
    },
    onPointerMove(e) {
      const g = gestureRef.current;
      if (!g || !isTracking(e)) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.direction) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const direction = dx < 0 ? 'left' : 'right';
        const allowed = direction === 'left' ? enabled : rightEnabled;
        if (!horizontal || !allowed || Date.now() - g.t > lockAfter) {
          gestureRef.current = null;
          return;
        }
        g.direction = direction;
      }
      move(
        g.direction === 'left'
          ? Math.max(-maxOffset, Math.min(0, dx))
          : Math.min(maxOffset, Math.max(0, dx)),
      );
    },
    onPointerUp(e) {
      const g = gestureRef.current;
      if (!g || !isTracking(e)) return;
      if (g.direction) {
        suppressClickRef.current = true;
        if (Math.abs(offsetRef.current) >= threshold) {
          if (g.direction === 'left') onSwipeRef.current();
          else onSwipeRightRef.current?.();
        }
      }
      reset();
    },
    onPointerCancel(e) {
      if (isTracking(e)) reset();
    },
    onClickCapture(e) {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return {
    handlers,
    /** 当前跟手偏移：左滑 < 0，右滑 > 0。 */
    offset,
    /** 已越过阈值：松手即触发，用于指示器高亮。 */
    armed: Math.abs(offset) >= threshold,
  };
}

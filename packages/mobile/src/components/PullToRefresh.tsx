import { useRef, useState } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

import { hasOpenOverlay } from '../back-navigation';

/**
 * 下拉刷新（issue 04：手动触发同步）。
 *
 * 手势判定不依赖 preventDefault：滚动容器在 scrollTop === 0 时向下拖，
 * 原生滚动本就无法继续（overflow-y-auto 容器无 overscroll），只需测量
 * 触点位移。仅响应主内容区（`main`）内的触摸；浮层（抽屉 / 菜单 /
 * dialog，Portal 到 body）打开时跳过，避免在弹层内误触发。
 *
 * 阻尼 0.5：牵引指示随手指移动但只走一半路程；超过阈值松手触发刷新，
 * 低于阈值回弹取消。
 */

const TRIGGER_THRESHOLD_PX = 72;
const RESISTANCE = 0.5;
const MAX_PULL_PX = 112;

interface TouchState {
  startY: number;
  /** 触点所在的（已处于顶部的）主内容滚动容器。 */
  scroller: HTMLElement | null;
}

/** 从触点向上找 main 内的滚动容器。 */
function findScrollableInMain(target: EventTarget | null): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  while (node && node.tagName !== 'MAIN') {
    if (node instanceof HTMLElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return node instanceof HTMLElement ? node : null;
}

interface Props {
  /** 松手触发；返回的 Promise 结束后指示器收起。 */
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const touch = useRef<TouchState | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (refreshing || e.touches.length !== 1) return;
    if (hasOpenOverlay()) return;
    const scroller = findScrollableInMain(e.target);
    if (!scroller || scroller.scrollTop > 0) return;
    touch.current = { startY: e.touches[0].clientY, scroller };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const state = touch.current;
    if (!state?.scroller) return;
    // 拖拽过程中容器滚离顶部（如下滑触发列表内嵌套滚动）→ 取消牵引。
    if (state.scroller.scrollTop > 0) {
      touch.current = null;
      setPull(0);
      return;
    }
    const dy = e.touches[0].clientY - state.startY;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    setPull(Math.min(dy * RESISTANCE, MAX_PULL_PX));
  };

  const onTouchEnd = () => {
    const state = touch.current;
    touch.current = null;
    if (!state) return;
    const reached = pull >= TRIGGER_THRESHOLD_PX;
    if (!reached) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    setPull(0);
    void Promise.resolve(onRefresh())
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  };

  const visible = pull > 0 || refreshing;
  const indicatorOffset = refreshing ? 40 : pull;

  return (
    <div
      className="relative h-[calc(100dvh-var(--kb-inset,0px))] w-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {children}
      {visible && (
        <div
          aria-hidden
          className="ptr-indicator top-16 z-50"
          style={{
            transform: `translateX(-50%) translateY(${Math.min(indicatorOffset - 36, 0)}px)`,
            opacity: refreshing ? 1 : Math.min(1, indicatorOffset / TRIGGER_THRESHOLD_PX),
          }}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowDown
              className="h-4 w-4 transition-transform"
              style={{ transform: `rotate(${indicatorOffset >= TRIGGER_THRESHOLD_PX ? 180 : 0}deg)` }}
            />
          )}
        </div>
      )}
    </div>
  );
}

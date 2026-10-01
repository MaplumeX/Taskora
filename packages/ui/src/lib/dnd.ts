import * as React from 'react';
import { defaultDropAnimationSideEffects, type DropAnimation } from '@dnd-kit/core';
import type { AnimateLayoutChanges, SortingStrategy } from '@dnd-kit/sortable';

/**
 * 拖拽排序的共享约定（Things 式「让位」模型）：
 *
 * - 被拖条目由 DragOverlay 跟手；列表内保留原条目但不可见，作为与真实
 *   行高完全一致的空位。
 * - 「实时预览」列表（项目页、分组视图、侧边栏项目）在拖拽中直接改本地
 *   布局让空位跟随指针；邻居的位移由 useFlipList 做 FLIP 滑动动画。
 *   此时 dnd-kit 的排序位移必须关闭（noopSortingStrategy），否则数据
 *   已重排后 transform 会再位移一次（双重位移 → 抖动、落点偏一格）。
 * - 松手后先同步写入本地顺序再持久化，避免等待乐观更新期间列表闪回原位。
 */

/** 实时预览列表用：布局本身已重排，不再叠加 dnd-kit 的排序位移。 */
export const noopSortingStrategy: SortingStrategy = () => null;

/** 实时预览列表用：位移动画统一交给 useFlipList，关闭 dnd-kit 自带的布局动画。 */
export const noLayoutAnimation: AnimateLayoutChanges = () => false;

/** 列表根节点标记：拖拽中不响应指针（无 hover 高亮），见 styles/tokens.css。 */
export const dndListProps = { 'data-dnd-list': '' };

/**
 * 跟手浮层的外壳：与列表行同圆角，只加「浮起」阴影，内容与列表行同参渲染，
 * 拖起来的就是那一行本身。底色由调用方给（主列表 bg-card / 侧边栏 bg-sidebar）。
 */
export const dragOverlayClass = 'pointer-events-none w-full overflow-hidden rounded-md shadow-row-lift';

/** 松手时浮层飞回空位的动画（与 FLIP 位移同一时长与曲线）。 */
export const dropAnimation: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  // 浮层落定前列表里的原条目保持不可见，避免松手瞬间出现两份。
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } }),
};

const FLIP_ATTR = 'data-flip-id';
const FLIP_DURATION_MS = 200;
const FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 标记参与 FLIP 的叶子行（嵌套元素只标最内层，避免父子位移叠加）。 */
export function flipId(id: string) {
  return { [FLIP_ATTR]: id };
}

/**
 * 列表重排的 FLIP 动画：改布局前调用 capture() 记录各行当前视觉位置，
 * version 变化后的 layout effect 中把每行从旧位置平滑移到新位置。
 * 只有 capture 过的那次重排才会播放（服务端同步等其它重渲染不受影响）。
 */
export function useFlipList<T extends HTMLElement>(version: unknown) {
  const rootRef = React.useRef<T | null>(null);
  const snapshotRef = React.useRef<Map<string, DOMRect> | null>(null);
  const animationsRef = React.useRef(new WeakMap<Element, Animation>());

  const capture = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rects = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>(`[${FLIP_ATTR}]`).forEach((element) => {
      const id = element.getAttribute(FLIP_ATTR);
      if (id) rects.set(id, element.getBoundingClientRect());
    });
    snapshotRef.current = rects;
  }, []);

  React.useLayoutEffect(() => {
    const before = snapshotRef.current;
    snapshotRef.current = null;
    const root = rootRef.current;
    if (!before || !root || prefersReducedMotion()) return;
    root.querySelectorAll<HTMLElement>(`[${FLIP_ATTR}]`).forEach((element) => {
      const previous = before.get(element.getAttribute(FLIP_ATTR) ?? '');
      if (!previous || typeof element.animate !== 'function') return;
      // 先停掉进行中的动画再量新位置：capture 量到的是动画中的视觉位置，
      // 新动画从那里接续，连续重排也不会跳帧。
      animationsRef.current.get(element)?.cancel();
      const next = element.getBoundingClientRect();
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      animationsRef.current.set(
        element,
        element.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
        ),
      );
    });
  }, [version]);

  return { rootRef, capture };
}

const HOLD_TIMEOUT_MS = 2000;

/**
 * 松手后的本地占位：持久化走异步乐观更新，props 至少晚一帧才到。期间
 * 直接用 props 渲染会让条目先闪回原位（drop 动画也飞回原位）再跳到新位置。
 * hold(next) 后返回 next，直到 props 的签名追上（或超时兜底）才交还 props。
 */
export function useHeldValue<T>(source: T, signature: (value: T) => string) {
  const [held, setHeld] = React.useState<{ value: T; key: string } | null>(null);
  const sourceKey = signature(source);
  const caughtUp = held !== null && held.key === sourceKey;

  React.useEffect(() => {
    if (caughtUp) setHeld(null);
  }, [caughtUp]);

  React.useEffect(() => {
    if (!held) return;
    const timer = window.setTimeout(() => setHeld(null), HOLD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [held]);

  // signature 由调用方以稳定（模块级）函数传入。
  const signatureRef = React.useRef(signature);
  signatureRef.current = signature;
  const hold = React.useCallback(
    (value: T) => setHeld({ value, key: signatureRef.current(value) }),
    [],
  );

  return [held && !caughtUp ? held.value : source, hold] as const;
}

/**
 * 按 ids 顺序重排 items 中可排序的那部分；不在 ids 里的条目（如平铺 feed
 * 里的项目行）原位不动，可排序条目依次填回它们原来占的槽位。
 */
export function applyOrder<T>(items: T[], ids: string[], getId: (item: T) => string): T[] {
  const byId = new Map(items.map((item) => [getId(item), item]));
  const ordered = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  if (ordered.length === 0) return items;
  const sortable = new Set(ordered.map(getId));
  let next = 0;
  return items.map((item) => (sortable.has(getId(item)) ? ordered[next++] : item));
}

/**
 * 平铺可排序列表：松手后以本地顺序渲染，直到 props 顺序追上。
 * 返回 [按本地顺序排好的 items, holdOrder(orderedIds)]；orderedIds 可只含
 * 可排序条目，其余条目保持原槽位。getId 须为稳定（模块级）函数。
 */
export function useHeldOrder<T>(items: T[], getId: (item: T) => string) {
  const ids = React.useMemo(() => items.map(getId), [items, getId]);
  const [order, hold] = useHeldValue(ids, joinIds);
  const ordered = React.useMemo(
    () => (order === ids ? items : applyOrder(items, order, getId)),
    [order, ids, items, getId],
  );
  const holdOrder = React.useCallback(
    (orderedIds: string[]) => hold(applyOrder(ids, orderedIds, identity)),
    [hold, ids],
  );
  return [ordered, holdOrder] as const;
}

function identity(id: string) {
  return id;
}

function joinIds(ids: string[]) {
  return ids.join('\u0000');
}

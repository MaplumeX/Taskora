import * as React from 'react';
import { defaultDropAnimationSideEffects, type DropAnimation } from '@dnd-kit/core';
import type { AnimateLayoutChanges, SortingStrategy } from '@dnd-kit/sortable';

import { useMultiSelectStore, useSelectionStore } from '@taskora/api';

import { flashRevealedRows, revealEnterOpacity, revealExitOpacity } from './laterReveal';

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

/**
 * 浮层外壳（dnd-kit 的 fixed 定位 div，始终在指针正下方）不接收指针，
 * 否则它挡住指针下方的元素：浮层渲染在哪里会影响下方是否出现 hover。
 * 用法：<DragOverlay className={dragOverlayWrapperClass}>。
 */
export const dragOverlayWrapperClass = 'pointer-events-none';

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

/** 一次重排里进场 + 离场的行数超过它（过滤切换、整批同步）就只做位移，不逐行进出场。 */
const MAX_ENTER_EXIT = 24;

interface FlipSnapshot {
  rects: Map<string, DOMRect>;
  elements: Map<string, HTMLElement>;
  /**
   * 数据驱动的重排（改日期、删除、新建、同步）：除位移外还播放进场 / 离场。
   * 拖拽中调用方 capture() 的重排只做位移——空位行与草稿行不该淡入淡出。
   */
  auto: boolean;
  /**
   * Hide Later Items 切换（captureReveal）：进出场按 laterReveal 的节奏淡入
   * 淡出、新行高亮，且不受 MAX_ENTER_EXIT 限制——一次显隐的就是这批行。
   */
  reveal?: boolean;
}

function measureRows(root: HTMLElement, auto: boolean): FlipSnapshot {
  const rects = new Map<string, DOMRect>();
  const elements = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>(`[${FLIP_ATTR}]`).forEach((element) => {
    const id = element.getAttribute(FLIP_ATTR);
    if (!id) return;
    rects.set(id, element.getBoundingClientRect());
    elements.set(id, element);
  });
  return { rects, elements, auto };
}

/** 两个矩形是否占同一位置（临时 id 换成真实 id 时，新旧行落在同一处）。 */
function sameSlot(a: DOMRect, b: DOMRect) {
  return Math.abs(a.top - b.top) < 1 && Math.abs(a.height - b.height) < 1;
}

/** 离场残影不能被当作真实行：去掉标识、选择、拖拽与测试用的属性。 */
const GHOST_KEPT_DATA_ATTRS = new Set(['data-state', 'data-disabled', 'data-empty']);

function stripGhostAttributes(element: Element) {
  for (const { name } of Array.from(element.attributes)) {
    if (
      name === 'id' ||
      name === 'tabindex' ||
      name === 'role' ||
      name.startsWith('aria-') ||
      (name.startsWith('data-') && !GHOST_KEPT_DATA_ATTRS.has(name))
    ) {
      element.removeAttribute(name);
    }
  }
}

/**
 * 离场：行已被 React 移除，在原位置放一份克隆，高度收到 0 并淡出。与邻行
 * 上移的 FLIP 同时长同曲线，残影底边与下一行顶边同步移动，二者不重叠——
 * 看起来就是行本身收起（同完成任务的收起）。
 */
function playExit(root: HTMLElement, element: HTMLElement, rect: DOMRect, reveal: boolean) {
  // 高度已为 0 的行（完成收起后才移除）不必再收一次。
  if (rect.height < 1 || rect.width < 1) return;
  const ghost = element.cloneNode(true) as HTMLElement;
  [ghost, ...Array.from(ghost.querySelectorAll('*'))].forEach(stripGhostAttributes);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  const rootRect = root.getBoundingClientRect();
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${rect.left - rootRect.left - root.clientLeft + root.scrollLeft}px`,
    top: `${rect.top - rootRect.top - root.clientTop + root.scrollTop}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    overflow: 'hidden',
    transform: 'none',
    pointerEvents: 'none',
  });
  root.appendChild(ghost);
  const animation = ghost.animate(
    [
      { height: `${rect.height}px`, opacity: 1 },
      ...(reveal ? [revealExitOpacity()] : []),
      { height: '0px', opacity: 0 },
    ],
    { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
  );
  animation.onfinish = () => ghost.remove();
  animation.oncancel = () => ghost.remove();
}

/**
 * 进场：自上而下揭开并淡入。下方邻行同时从旧位置（向上偏一行高）FLIP 下移，
 * 揭开的底边与邻行顶边同步，看起来就是行从 0 高度撑开。
 */
function playEnter(element: HTMLElement, reveal: boolean) {
  if (reveal) flashRevealedRows(element);
  return element.animate(
    [
      { clipPath: 'inset(0 0 100% 0)', opacity: 0 },
      ...(reveal ? [revealEnterOpacity()] : []),
      { clipPath: 'inset(0 0 0 0)', opacity: 1 },
    ],
    { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
  );
}

/**
 * 列表行的位移 / 进场 / 离场动画（FLIP）。行用 flipId() 标记。
 *
 * - 拖拽：改布局前调用 capture() 记录各行当前视觉位置，version 变化后的
 *   layout effect 中把每行从旧位置平滑移到新位置。
 * - 数据变化（改 When 日期换了分组、删除、新建、移走、同步）：version 变化
 *   的那次渲染时 DOM 仍是旧的，在此自动记录；提交后除位移外，新出现的行
 *   撑开进场、消失的行收起离场（对齐 Things 3）。
 * - Hide Later Items 切换：改布局前调用 captureReveal()，进出场换成显隐
 *   稍后项的节奏（见 lib/laterReveal.ts），不受行数上限。
 * - 前后没有任何共同行（首次加载、切换到另一个项目）视为整体替换，不做动画。
 */
export function useFlipList<T extends HTMLElement>(version: unknown) {
  const rootRef = React.useRef<T | null>(null);
  const snapshotRef = React.useRef<FlipSnapshot | null>(null);
  const versionRef = React.useRef(version);
  const animationsRef = React.useRef(new WeakMap<Element, Animation>());

  const capture = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    snapshotRef.current = measureRows(root, false);
  }, []);

  const captureReveal = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    snapshotRef.current = { ...measureRows(root, true), reveal: true };
  }, []);

  if (versionRef.current !== version) {
    versionRef.current = version;
    if (!snapshotRef.current && rootRef.current) {
      snapshotRef.current = measureRows(rootRef.current, true);
    }
  }

  React.useLayoutEffect(() => {
    const before = snapshotRef.current;
    snapshotRef.current = null;
    const root = rootRef.current;
    if (!before || !root || typeof root.animate !== 'function' || prefersReducedMotion()) return;
    const current = measureRows(root, true);
    const shared = [...current.elements.keys()].filter((id) => before.rects.has(id));
    if (shared.length === 0) return;

    for (const id of shared) {
      const element = current.elements.get(id)!;
      const previous = before.rects.get(id)!;
      // 先停掉进行中的动画再量新位置：capture 量到的是动画中的视觉位置，
      // 新动画从那里接续，连续重排也不会跳帧。
      animationsRef.current.get(element)?.cancel();
      const next = element.getBoundingClientRect();
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      animationsRef.current.set(
        element,
        element.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
        ),
      );
    }

    if (!before.auto) return;
    let entered = [...current.elements.keys()].filter((id) => !before.rects.has(id));
    let exited = [...before.rects.keys()].filter((id) => !current.elements.has(id));
    // 同一位置一出一进是同一行换了 id（乐观新建的临时 id → 服务端 id、
    // Magic Plus 草稿 → 真实任务），不是进出场。
    for (const id of [...exited]) {
      const rect = before.rects.get(id)!;
      const swap = entered.find((other) => sameSlot(rect, current.rects.get(other)!));
      if (!swap) continue;
      exited = exited.filter((other) => other !== id);
      entered = entered.filter((other) => other !== swap);
    }
    const reveal = before.reveal === true;
    if (!reveal && entered.length + exited.length > MAX_ENTER_EXIT) return;
    for (const id of exited) {
      playExit(root, before.elements.get(id)!, before.rects.get(id)!, reveal);
    }
    for (const id of entered) {
      const element = current.elements.get(id)!;
      animationsRef.current.set(element, playEnter(element, reveal));
    }
  }, [version]);

  return { rootRef, capture, captureReveal };
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

/**
 * 多项拖拽的选中集合：触控多选模式中为勾选集合（对齐 Things 3 iPhone：
 * 按住勾选中的一项，其余勾选项一起拖动），否则为键盘 Selection。
 */
export function dragSelectionIds(): readonly string[] {
  const multiSelect = useMultiSelectStore.getState();
  return multiSelect.active ? multiSelect.ids : useSelectionStore.getState().selectedIds;
}

/**
 * 多项拖拽（对齐 Things 3 Mac）：被拖任务在 Selection 多选中时，返回一起拖动的
 * 整组任务 id（按 orderedIds 的显示顺序，含被拖任务）；否则 null（单项拖拽）。
 * 只算本列表内的选中任务。拖拽中组内其余行收起（见 useCollapseAfterDragStart），
 * 只有被拖行跟手与预览落点；松手后整组按原显示顺序落在被拖行的位置（见
 * expandDragGroup）。
 */
export function dragGroupOf(
  activeId: string,
  orderedIds: readonly string[],
  selectedIds: readonly string[],
): string[] | null {
  if (!selectedIds.includes(activeId)) return null;
  const selected = new Set(selectedIds);
  const group = orderedIds.filter((id) => selected.has(id));
  return group.length > 1 ? group : null;
}

/**
 * 多项拖拽松手：id 为 activeId 的那项替换为整组（group 按显示顺序，含被拖项）；
 * 组内其余项若还在 items 中，先从原位置取走。
 */
export function expandDragGroup<T>(
  items: T[],
  activeId: string,
  group: T[],
  getId: (item: T) => string,
): T[] {
  const others = new Set(group.map(getId).filter((id) => id !== activeId));
  const rest = items.filter((item) => !others.has(getId(item)));
  const index = rest.findIndex((item) => getId(item) === activeId);
  if (index < 0) return items;
  return [...rest.slice(0, index), ...group, ...rest.slice(index + 1)];
}

/**
 * 多项拖拽收起组内其余行的时机：拖拽开始那次提交之后的 effect。
 *
 * DragOverlay（无浮层时则是被拖行自身的跟手位移）以拖拽开始时测得的被拖行
 * 位置为基准，dnd-kit 在拖拽开始那次提交的 layout effect 里测量。若收起与
 * 拖拽开始同一次提交，被拖行上方的选中行先消失、被拖行上移，测得的基准随之
 * 偏移，浮层就不再贴着手。requestAnimationFrame 也不可靠：拖拽在原生
 * mousemove 里启动，React 不同步提交，回调可能先于那次提交执行。
 *
 * pending 在拖拽开始那次提交中变为 true；collapse 负责收起并让 pending 复位。
 */
export function useCollapseAfterDragStart(pending: boolean, collapse: () => void): void {
  const collapseRef = React.useRef(collapse);
  collapseRef.current = collapse;
  React.useEffect(() => {
    if (pending) collapseRef.current();
  }, [pending]);
}

import * as React from 'react';
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type Activators,
  type AutoScrollOptions,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
  type KeyboardSensorOptions,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import {
  SIDEBAR_DROP_REGION_ID,
  isSidebarDropId,
  parseSidebarDropId,
  sidebarDropAccepts,
  sidebarDropId,
  type SidebarDropPayload,
  type SidebarDropTarget,
} from '@/components/layout/sidebarDrop';
import { dropAnimation } from './dnd';

/**
 * 全应用唯一的 DndContext（ADR 0018）：侧边栏与内容区共用，任务 / 项目行
 * 才能拖到侧边栏上（Sidebar Drop）。
 *
 * 每个可拖拽的列表（以及侧边栏的项目 / 区域排序）是一个 surface，经
 * useDndSurface 登记：
 * - owns(id)：哪些拖拽源与落点 id 属于它。拖拽事件只交给拥有被拖条目的
 *   surface；碰撞检测只在它自己的落点里找（collisionDetection 缺省为
 *   closestCenter）。
 * - sidebarPayload(activeId)：拖到侧边栏时的载荷；缺省或返回 null 即不可
 *   拖到侧边栏。
 *
 * 指针在侧边栏内时（且被拖条目可拖到侧边栏），只考虑侧边栏落点：命中
 * 可接收的行则 over 为该行，否则 over 为侧边栏整体（SIDEBAR_DROP_REGION_ID）。
 * surface 收到不属于自己的 over 即视为「在列表外」，空位回到原处；在侧边
 * 栏上松手时 surface 收到的是 onDragCancel，落点动作由 onSidebarDrop 执行。
 *
 * 只能在一个 surface 里同时存在的 DragOverlay：overlayActive 为 true 的
 * surface 才渲染 DragOverlay（DndContext 只有一个浮层测量位）。
 */

export interface DndSurface {
  owns: (id: string) => boolean;
  collisionDetection?: CollisionDetection;
  autoScroll?: boolean | AutoScrollOptions;
  /** 键盘拖拽的坐标计算（仅对 keyboardDragData 标记过的拖拽源生效）。 */
  keyboardCoordinates?: KeyboardCoordinateGetter;
  sidebarPayload?: (activeId: string) => SidebarDropPayload | null;
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: () => void;
}

/**
 * 侧边栏的自动滚动：内容在 Radix ScrollArea 里滚动。dnd-kit 默认 autoScroll
 * （20% 边缘区 + 5ms 间隔 + 10 加速度）在列表可滚动时会把指针进入底部边缘
 * 区的拖拽变成 ~2000px/s 的失控狂滚。收窄边缘区并放缓滚动，保留「贴边
 * 轻滚」的定位手感。
 */
export const SIDEBAR_AUTO_SCROLL: AutoScrollOptions = {
  threshold: { x: 0.2, y: 0.06 },
  acceleration: 4,
  interval: 20,
};

/** 允许键盘启动拖拽的拖拽源：useSortable({ data: keyboardDragData })。 */
export const keyboardDragData = { keyboardDrag: true };

/**
 * 只为显式标记的拖拽源启动键盘拖拽。共享 DndContext 的传感器作用于所有
 * 拖拽源，而大多数行的 Enter / Space 是全局键位（ADR-0004），不能被拦成拖拽。
 */
class OptInKeyboardSensor extends KeyboardSensor {
  static activators: Activators<KeyboardSensorOptions> = [
    {
      eventName: 'onKeyDown',
      handler: (event, options, context) =>
        context.active.data.current?.keyboardDrag === true &&
        KeyboardSensor.activators[0].handler(event, options, context) === true,
    },
  ];
}

interface AppDndValue {
  register: (id: string, surface: React.MutableRefObject<DndSurface>) => () => void;
  overlaySurface: string | null;
  overSidebar: boolean;
  sidebarAreaRef: React.MutableRefObject<HTMLElement | null>;
}

const AppDndContext = React.createContext<AppDndValue | null>(null);

interface ActiveDrag {
  id: string;
  surfaceId: string;
  surface: React.MutableRefObject<DndSurface>;
  /** 可拖到侧边栏时的载荷类型。 */
  payloadKind: SidebarDropPayload['kind'] | null;
}

function liveRect(container: DroppableContainer, rects: Map<unknown, ClientRect>) {
  const rect = container.node.current?.getBoundingClientRect() ?? rects.get(container.id);
  return rect && rect.width > 0 && rect.height > 0 ? rect : null;
}

function contains(rect: Pick<ClientRect, 'top' | 'bottom' | 'left' | 'right'>, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function AppDndProvider({
  children,
  onSidebarDrop,
}: {
  children: React.ReactNode;
  /** 在可接收的侧边栏行上松手；anchor 为该行的节点（落点后弹出卡片的锚点）。 */
  onSidebarDrop?: (
    payload: SidebarDropPayload,
    target: SidebarDropTarget,
    anchor: HTMLElement | null,
  ) => void;
}) {
  const surfacesRef = React.useRef(new Map<string, React.MutableRefObject<DndSurface>>());
  const activeRef = React.useRef<ActiveDrag | null>(null);
  const sidebarAreaRef = React.useRef<HTMLElement | null>(null);
  const onSidebarDropRef = React.useRef(onSidebarDrop);
  onSidebarDropRef.current = onSidebarDrop;
  const [overlaySurface, setOverlaySurface] = React.useState<string | null>(null);
  const [overSidebar, setOverSidebar] = React.useState(false);
  const [autoScroll, setAutoScroll] = React.useState<boolean | AutoScrollOptions>(true);

  const register = React.useCallback(
    (id: string, surface: React.MutableRefObject<DndSurface>) => {
      surfacesRef.current.set(id, surface);
      return () => {
        surfacesRef.current.delete(id);
      };
    },
    [],
  );

  const activeFor = React.useCallback((activeId: string): ActiveDrag | null => {
    if (activeRef.current?.id === activeId) return activeRef.current;
    for (const [surfaceId, surface] of surfacesRef.current) {
      if (!surface.current.owns(activeId)) continue;
      const payloadKind = surface.current.sidebarPayload?.(activeId)?.kind ?? null;
      return { id: activeId, surfaceId, surface, payloadKind };
    }
    return null;
  }, []);

  const keyboardCoordinates = React.useCallback<KeyboardCoordinateGetter>(
    (event, args) =>
      (activeRef.current?.surface.current.keyboardCoordinates ?? sortableKeyboardCoordinates)(
        event,
        args,
      ),
    [],
  );

  // 鼠标：移动 5px 激活；触摸：按住 300ms 再移动才激活，避免与列表滚动
  // 冲突（PointerSensor 会在触摸滑动 5px 时误触拖拽）。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(OptInKeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const collisionDetection = React.useCallback<CollisionDetection>(
    (args) => {
      const active = activeFor(String(args.active.id));
      if (!active) return [];
      const pointer = args.pointerCoordinates;
      const area = sidebarAreaRef.current?.getBoundingClientRect();
      if (active.payloadKind && pointer && area && contains(area, pointer.x, pointer.y)) {
        // 侧边栏的行随侧边栏滚动，按当前位置命中（缓存的测量可能已过时）。
        const hit = args.droppableContainers.find((container) => {
          const target = parseSidebarDropId(String(container.id));
          if (!target || !sidebarDropAccepts(active.payloadKind!, target.kind)) return false;
          const rect = liveRect(container, args.droppableRects);
          return !!rect && contains(rect, pointer.x, pointer.y);
        });
        return [{ id: hit?.id ?? SIDEBAR_DROP_REGION_ID }];
      }
      const surface = active.surface.current;
      const own = args.droppableContainers.filter((container) => {
        const id = String(container.id);
        return !isSidebarDropId(id) && surface.owns(id);
      });
      return (surface.collisionDetection ?? closestCenter)({ ...args, droppableContainers: own });
    },
    [activeFor],
  );

  // overSidebar 保持到下一次拖拽开始：松手那次渲染要据它关掉落位动画。
  const endDrag = () => {
    activeRef.current = null;
    setAutoScroll(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const found = activeFor(String(event.active.id));
    // Sidebar Drop 只属于桌面 / Web 指针交互：触摸长按只负责排序（带触屏的
    // 桌面上侧边栏可见，也不接收）。
    const touch =
      typeof TouchEvent !== 'undefined' && event.activatorEvent instanceof TouchEvent;
    const active = found && touch ? { ...found, payloadKind: null } : found;
    activeRef.current = active;
    setOverSidebar(false);
    if (!active) return;
    setOverlaySurface(active.surfaceId);
    setAutoScroll(active.surface.current.autoScroll ?? true);
    active.surface.current.onDragStart?.(event);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    activeRef.current?.surface.current.onDragMove?.(event);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const active = activeRef.current;
    if (!active) return;
    const onSidebar = !!event.over && isSidebarDropId(String(event.over.id));
    setOverSidebar(onSidebar);
    setAutoScroll(onSidebar ? SIDEBAR_AUTO_SCROLL : (active.surface.current.autoScroll ?? true));
    active.surface.current.onDragOver?.(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const active = activeRef.current;
    endDrag();
    if (!active) return;
    const surface = active.surface.current;
    const overId = event.over ? String(event.over.id) : null;
    if (overId === null || !isSidebarDropId(overId)) {
      surface.onDragEnd?.(event);
      return;
    }
    // 先取载荷（含多选整组），再让列表复位（会清掉它的拖拽状态）。
    const payload = surface.sidebarPayload?.(active.id) ?? null;
    const target = parseSidebarDropId(overId);
    const data = event.over?.data?.current as SidebarDropData | undefined;
    const anchor = data?.anchor.current ?? null;
    surface.onDragCancel?.();
    if (payload && target) onSidebarDropRef.current?.(payload, target, anchor);
  };

  const handleDragCancel = () => {
    const active = activeRef.current;
    endDrag();
    active?.surface.current.onDragCancel?.();
  };

  const value = React.useMemo<AppDndValue>(
    () => ({ register, overlaySurface, overSidebar, sidebarAreaRef }),
    [register, overlaySurface, overSidebar],
  );

  return (
    <AppDndContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        // 实时预览每次重排都会改变行位置，碰撞检测须用最新的测量结果。
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={autoScroll}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
      </DndContext>
    </AppDndContext.Provider>
  );
}


/**
 * 登记一个拖拽 surface。返回：
 * - overlayActive：本 surface 是否持有 DragOverlay（最近一次拖拽由它发起，
 *   松手后保持到下一次拖拽，落位动画才能播完）。
 * - dropAnimation：落位动画；在侧边栏上松手时为 null（条目已离开列表，
 *   不再飞回原处）。
 */
export function useDndSurface(surface: DndSurface) {
  // 应用内始终在 AppShell 的 AppDndProvider 下；脱离应用壳单独渲染（如组件
  // 测试）时不登记，列表照常显示、只是不可拖。
  const app = React.useContext(AppDndContext);
  const register = app?.register;
  const id = React.useId();
  const surfaceRef = React.useRef(surface);
  surfaceRef.current = surface;
  React.useLayoutEffect(() => register?.(id, surfaceRef), [register, id]);
  return {
    overlayActive: app?.overlaySurface === id,
    dropAnimation: app?.overSidebar ? null : dropAnimation,
  } satisfies { overlayActive: boolean; dropAnimation: DropAnimation | null };
}

interface SidebarDropData {
  anchor: React.MutableRefObject<HTMLElement | null>;
}

/** 侧边栏的一行作为 Sidebar Drop 落点；isOver 时该行可接收被拖条目。 */
export function useSidebarDropTarget(target: SidebarDropTarget | null) {
  const fallbackId = React.useId();
  const anchor = React.useRef<HTMLElement | null>(null);
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: target ? sidebarDropId(target) : `not-a-drop-target:${fallbackId}`,
    disabled: !target,
    data: { anchor } satisfies SidebarDropData,
  });
  const setNodeRef = React.useCallback(
    (node: HTMLElement | null) => {
      anchor.current = node;
      setDroppableRef(node);
    },
    [setDroppableRef],
  );
  return { setNodeRef, isOver: !!target && isOver };
}

/**
 * 侧边栏整体：area 为命中范围（整个侧边栏），content 为滚动区内的内容
 * （作为「侧边栏整体」的 over 节点，dnd-kit 据它找到可自动滚动的容器）。
 */
export function useSidebarDropArea() {
  const sidebarAreaRef = React.useContext(AppDndContext)?.sidebarAreaRef;
  const { setNodeRef } = useDroppable({ id: SIDEBAR_DROP_REGION_ID });
  const setAreaRef = React.useCallback(
    (node: HTMLElement | null) => {
      if (sidebarAreaRef) sidebarAreaRef.current = node;
    },
    [sidebarAreaRef],
  );
  return { setAreaRef, setContentRef: setNodeRef };
}

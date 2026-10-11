import * as React from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  PointerSensor,
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
  type MouseSensorOptions,
  type PointerSensorOptions,
  type TouchSensorOptions,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import { haptic } from '@taskora/api';

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
import { MAGIC_PLUS_CANCEL_RADIUS, MAGIC_PLUS_INBOX_ID, isMagicPlus } from './magicPlus';

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
 *
 * Magic Plus（手机端添加按钮的拖动，见 lib/magicPlus.ts）：由声明了
 * magicPlus 的 surface 认领（当前页的主列表），浮层是 provider 自己渲染的
 * 圆形按钮；拖回按钮原位附近松手视为取消。指针在左下角 Inbox 目标上时
 * over 为该目标（同侧边栏，列表收回空位），在其上松手由目标自己处理。
 */

export interface DndSurface {
  owns: (id: string) => boolean;
  collisionDetection?: CollisionDetection;
  autoScroll?: boolean | AutoScrollOptions;
  /** 键盘拖拽的坐标计算（仅对 keyboardDragData 标记过的拖拽源生效）。 */
  keyboardCoordinates?: KeyboardCoordinateGetter;
  sidebarPayload?: (activeId: string) => SidebarDropPayload | null;
  /** 接收 Magic Plus 拖动（把新建的空任务放到落点）。 */
  magicPlus?: boolean;
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

interface ActivationContext {
  active: { data: { current?: Record<string, unknown> | undefined } };
}

const isMagicPlusSource = (context?: ActivationContext) =>
  context?.active.data.current?.magicPlus === true;

/**
 * Magic Plus 专用：按下后移动 8px 即开始拖（不需要长按——按钮固定在角落，
 * 不在滚动容器里）。用 pointer 事件，与下面两个只认列表行的传感器各占一个
 * 事件名（dnd-kit 同一拖拽源上同名 activator 只保留最后一个）。按钮需
 * `touch-action: none`，否则触屏移动会被浏览器当作平移而 pointercancel。
 */
class MagicPlusSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        event: React.PointerEvent,
        options: PointerSensorOptions,
        context?: ActivationContext,
      ) =>
        isMagicPlusSource(context) && PointerSensor.activators[0].handler(event, options),
    },
  ];
}

class RowMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: (event: React.MouseEvent, options: MouseSensorOptions, context?: ActivationContext) =>
        !isMagicPlusSource(context) && MouseSensor.activators[0].handler(event, options),
    },
  ];
}

class RowTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: (event: React.TouchEvent, options: TouchSensorOptions, context?: ActivationContext) =>
        !isMagicPlusSource(context) && TouchSensor.activators[0].handler(event, options),
    },
  ];
}

/** overlaySurface 的特殊值：Magic Plus 浮层由 provider 渲染。 */
const MAGIC_PLUS_OVERLAY = 'magic-plus-overlay';

interface AppDndValue {
  register: (id: string, surface: React.MutableRefObject<DndSurface>) => () => void;
  overlaySurface: string | null;
  /** 正在拖动 Magic Plus（Inbox 目标据此浮现）。 */
  magicPlusDragging: boolean;
  /** 当前有列表接收 Magic Plus（添加按钮据此决定可否拖动）。 */
  magicPlusAvailable: boolean;
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
  const [magicPlusDragging, setMagicPlusDragging] = React.useState(false);
  const [magicPlusSurfaces, setMagicPlusSurfaces] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [autoScroll, setAutoScroll] = React.useState<boolean | AutoScrollOptions>(true);

  const register = React.useCallback(
    (id: string, surface: React.MutableRefObject<DndSurface>) => {
      surfacesRef.current.set(id, surface);
      const accepts = !!surface.current.magicPlus;
      if (accepts) setMagicPlusSurfaces((prev) => new Set(prev).add(id));
      return () => {
        surfacesRef.current.delete(id);
        if (accepts) {
          setMagicPlusSurfaces((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      };
    },
    [],
  );

  const activeFor = React.useCallback((activeId: string): ActiveDrag | null => {
    if (activeRef.current?.id === activeId) return activeRef.current;
    if (isMagicPlus(activeId)) {
      // 后登记的优先：页面切换时新页的列表晚于旧页卸载前登记。
      const accepting = [...surfacesRef.current].filter(([, s]) => s.current.magicPlus);
      const [surfaceId, surface] = accepting[accepting.length - 1] ?? [];
      return surfaceId && surface ? { id: activeId, surfaceId, surface, payloadKind: null } : null;
    }
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
    useSensor(MagicPlusSensor, { activationConstraint: { distance: 8 } }),
    useSensor(RowMouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(RowTouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(OptInKeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const collisionDetection = React.useCallback<CollisionDetection>(
    (args) => {
      const pointer = args.pointerCoordinates;
      if (isMagicPlus(String(args.active.id)) && pointer) {
        const inbox = args.droppableContainers.find(({ id }) => id === MAGIC_PLUS_INBOX_ID);
        const rect = inbox && liveRect(inbox, args.droppableRects);
        if (rect && contains(rect, pointer.x, pointer.y)) return [{ id: MAGIC_PLUS_INBOX_ID }];
      }
      const active = activeFor(String(args.active.id));
      if (!active) return [];
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
        return !isSidebarDropId(id) && id !== MAGIC_PLUS_INBOX_ID && surface.owns(id);
      });
      return (surface.collisionDetection ?? closestCenter)({ ...args, droppableContainers: own });
    },
    [activeFor],
  );

  // overSidebar 保持到下一次拖拽开始：松手那次渲染要据它关掉落位动画。
  const endDrag = () => {
    activeRef.current = null;
    setAutoScroll(true);
    setMagicPlusDragging(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (isMagicPlus(String(event.active.id))) {
      const active = activeFor(String(event.active.id));
      activeRef.current = active;
      setOverSidebar(false);
      setOverlaySurface(MAGIC_PLUS_OVERLAY);
      setMagicPlusDragging(true);
      // 触感（对齐 Things 3 iPhone）：拖起与落位各一次；仅手机壳注入实现。
      haptic('lift');
      if (!active) return;
      setAutoScroll(active.surface.current.autoScroll ?? true);
      active.surface.current.onDragStart?.(event);
      return;
    }
    const found = activeFor(String(event.active.id));
    // Sidebar Drop 只属于桌面 / Web 指针交互：触摸长按只负责排序（带触屏的
    // 桌面上侧边栏可见，也不接收）。
    const touch =
      typeof TouchEvent !== 'undefined' && event.activatorEvent instanceof TouchEvent;
    const active = found && touch ? { ...found, payloadKind: null } : found;
    activeRef.current = active;
    setOverSidebar(false);
    if (!active) return;
    haptic('lift');
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
    if (event.over?.id === MAGIC_PLUS_INBOX_ID) {
      // 落在 Inbox 目标上：列表复位，由目标打开快速添加卡片。
      active?.surface.current.onDragCancel?.();
      (event.over.data.current as MagicPlusInboxData | undefined)?.onDrop();
      haptic('drop');
      return;
    }
    if (!active) return;
    const surface = active.surface.current;
    if (
      isMagicPlus(active.id) &&
      Math.hypot(event.delta.x, event.delta.y) < MAGIC_PLUS_CANCEL_RADIUS
    ) {
      // 拖回按钮原位：取消，不新建。
      surface.onDragCancel?.();
      return;
    }
    const overId = event.over ? String(event.over.id) : null;
    if (overId === null || !isSidebarDropId(overId)) {
      surface.onDragEnd?.(event);
      if (overId !== null) haptic('drop');
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
    setMagicPlusDragging(false);
    const active = activeRef.current;
    endDrag();
    active?.surface.current.onDragCancel?.();
  };

  const magicPlusAvailable = magicPlusSurfaces.size > 0;
  const value = React.useMemo<AppDndValue>(
    () => ({
      register,
      overlaySurface,
      magicPlusDragging,
      magicPlusAvailable,
      overSidebar,
      sidebarAreaRef,
    }),
    [register, overlaySurface, magicPlusDragging, magicPlusAvailable, overSidebar],
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
        {overlaySurface === MAGIC_PLUS_OVERLAY && (
          // 跟手的是按钮本身；松手后条目已在列表里展开，不飞回。
          <DragOverlay className="pointer-events-none" dropAnimation={null}>
            <div
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-popover"
            >
              <Plus className="h-6 w-6" />
            </div>
          </DragOverlay>
        )}
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
  // 是否接收 Magic Plus 变化时重新登记（provider 据此告诉添加按钮能否拖动）。
  const acceptsMagicPlus = !!surface.magicPlus;
  React.useLayoutEffect(
    () => register?.(id, surfaceRef),
    [register, id, acceptsMagicPlus],
  );
  return {
    overlayActive: app?.overlaySurface === id,
    dropAnimation: app?.overSidebar ? null : dropAnimation,
  } satisfies { overlayActive: boolean; dropAnimation: DropAnimation | null };
}

interface MagicPlusInboxData {
  onDrop: () => void;
}

/**
 * 左下角 Inbox 目标（Magic Plus 拖动中浮现）：返回是否在拖、指针是否在其上；
 * 在其上松手调用 onDrop。
 */
/** 当前页有列表接收 Magic Plus（不在应用壳里时为 false）。 */
export function useMagicPlusAvailable() {
  return React.useContext(AppDndContext)?.magicPlusAvailable ?? false;
}

export function useMagicPlusInboxTarget(onDrop: () => void) {
  const dragging = React.useContext(AppDndContext)?.magicPlusDragging ?? false;
  const onDropRef = React.useRef(onDrop);
  onDropRef.current = onDrop;
  const data = React.useMemo<MagicPlusInboxData>(() => ({ onDrop: () => onDropRef.current() }), []);
  const { setNodeRef, isOver } = useDroppable({
    id: MAGIC_PLUS_INBOX_ID,
    disabled: !dragging,
    data,
  });
  return { dragging, isOver: dragging && isOver, setNodeRef };
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

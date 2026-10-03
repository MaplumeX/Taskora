import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  clampSidebarWidth,
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarUiStore,
} from '@taskora/api';

import { Sidebar } from './Sidebar';

/** Arrow-key step when resizing from the keyboard. */
const KEYBOARD_STEP = 16;

/** Two presses within this window (ms) count as one double-click. */
const DOUBLE_CLICK_WINDOW = 500;

/**
 * Pause after releasing at a width below the minimum before the sidebar
 * settles (collapses or springs back to the minimum), as in Things.
 */
export const SIDEBAR_SETTLE_DELAY = 300;

/**
 * Desktop sidebar with a Things-style right-edge grip. While dragging the
 * sidebar follows the pointer freely, even narrower than its minimum; when
 * released below the minimum it holds that width for a moment, then
 * animates closed (below the collapse threshold) or back out to the minimum.
 * Dragging out from the window edge brings a collapsed sidebar back the
 * same way; hovering that edge reveals a small tab that expands it on click. The sidebar stays mounted while collapsed (section state,
 * scroll position survive) and is made inert.
 */
export function ResizableSidebar() {
  const storedWidth = useSidebarUiStore((s) => s.width);
  const collapsed = useSidebarUiStore((s) => s.collapsed);
  const setWidth = useSidebarUiStore((s) => s.setWidth);
  const setCollapsed = useSidebarUiStore((s) => s.setCollapsed);
  // Free width while dragging or waiting to settle; null = show the store.
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  const dragStartWidth = useRef(0);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const width = liveWidth ?? (collapsed ? 0 : storedWidth);
  const hidden = liveWidth === null && collapsed;

  const onDragStart = () => {
    clearTimeout(settleTimer.current);
    dragStartWidth.current = width;
    return width;
  };
  const onDragMove = (raw: number) =>
    setLiveWidth(Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(0, raw))));
  const onDragEnd = (final: number) => {
    // 只是点击：收起时点边缘把手展开，否则不改任何状态
    if (final === dragStartWidth.current) {
      setLiveWidth(null);
      if (final === 0) setCollapsed(false);
      return;
    }
    if (final >= SIDEBAR_MIN_WIDTH) {
      setWidth(final);
      setCollapsed(false);
      setLiveWidth(null);
      return;
    }
    // 窄于最小宽度：先停在松手的位置，停顿后再动画收起或弹回最小宽度
    settleTimer.current = setTimeout(() => {
      if (final < SIDEBAR_COLLAPSE_THRESHOLD) {
        setCollapsed(true);
      } else {
        setWidth(SIDEBAR_MIN_WIDTH);
        setCollapsed(false);
      }
      setLiveWidth(null);
    }, SIDEBAR_SETTLE_DELAY);
  };

  return (
    <div
      data-testid="desktop-sidebar"
      style={{ width }}
      className={cn(
        'relative hidden shrink-0 md:flex',
        // 拖动中跟手；松手后的收起 / 弹回与键盘调整走动画
        liveWidth === null && 'transition-[width] duration-base ease-expand',
      )}
    >
      <div className="flex h-full w-full overflow-hidden" {...(hidden ? { inert: '' } : {})}>
        {/* 内容不窄于最小宽度：更窄时只裁切不重排 */}
        <div
          className="flex h-full shrink-0"
          style={{ width: Math.max(SIDEBAR_MIN_WIDTH, liveWidth ?? storedWidth) }}
        >
          <Sidebar />
        </div>
      </div>
      <SidebarResizeHandle
        width={width}
        collapsed={hidden}
        atEdge={width === 0}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />
    </div>
  );
}

function SidebarResizeHandle({
  width,
  collapsed,
  atEdge,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  width: number;
  collapsed: boolean;
  /** Zero width: the grip has to sit inside the window to be grabbable. */
  atEdge: boolean;
  /** Returns the width the drag starts from. */
  onDragStart: () => number;
  onDragMove: (width: number) => void;
  onDragEnd: (width: number) => void;
}) {
  const { t } = useTranslation();
  const setWidth = useSidebarUiStore((s) => s.setWidth);
  const setCollapsed = useSidebarUiStore((s) => s.setCollapsed);
  const dragRef = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  // 双击的首次按下时是否处于收起：那次单击已经展开，双击不再恢复默认宽度
  const lastDown = useRef({ at: -Infinity, collapsed: false });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (e.timeStamp - lastDown.current.at > DOUBLE_CLICK_WINDOW) {
      lastDown.current.collapsed = collapsed;
    }
    lastDown.current.at = e.timeStamp;
    e.currentTarget.setPointerCapture(e.pointerId);
    const startWidth = onDragStart();
    dragRef.current = { startX: e.clientX, startWidth, width: startWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.width = Math.round(
      Math.min(SIDEBAR_MAX_WIDTH, Math.max(0, drag.startWidth + e.clientX - drag.startX)),
    );
    onDragMove(drag.width);
  };
  const endDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onDragEnd(drag.width);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (collapsed) return;
      // 已到最窄再按 ← 收起
      if (width <= SIDEBAR_MIN_WIDTH) setCollapsed(true);
      else setWidth(width - KEYBOARD_STEP);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (collapsed) setCollapsed(false);
      else setWidth(clampSidebarWidth(width + KEYBOARD_STEP));
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('nav:resizeSidebar')}
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      className={cn(
        'group absolute inset-y-0 z-10 cursor-col-resize touch-none outline-none',
        // 折叠后贴着窗口左缘（整条留在窗口内才能被抓到），并加宽成感应区
        atEdge ? 'left-0 w-4' : '-right-1 w-2',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // 双击恢复默认宽度（收起时单击已展开，见 onDragEnd）
      onDoubleClick={() => {
        if (!lastDown.current.collapsed) setWidth(SIDEBAR_DEFAULT_WIDTH);
      }}
      onKeyDown={onKeyDown}
    >
      {collapsed ? (
        // 收起后：鼠标靠近左缘时浮出的小把手，点击展开、拖动拉出
        <div
          data-testid="sidebar-reveal-tab"
          className="absolute left-0 top-1/2 flex h-10 w-4 -translate-x-full -translate-y-1/2 cursor-pointer items-center justify-center rounded-r-md border border-l-0 border-border bg-sidebar text-muted-foreground opacity-0 shadow-sm transition-[opacity,transform] duration-fast ease-expand group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      ) : (
        // 悬停 / 拖动 / 键盘聚焦时显示的细线，压在侧边栏右边缘上
        <div
          className={cn(
            'absolute inset-y-0 w-0.5 bg-primary opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100',
            atEdge ? 'left-0' : 'left-1 -translate-x-1/2',
          )}
        />
      )}
    </div>
  );
}

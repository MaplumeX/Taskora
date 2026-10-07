import * as React from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import type { TagResponseDto } from '@taskora/shared';
import {
  useCreateTag,
  useDeleteTag,
  useReorderTags,
  useTagsQuery,
  useUpdateTag,
} from '@taskora/api';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  dndListProps,
  dragOverlayClass,
  dragOverlayWrapperClass,
  dropAnimation,
  flipId,
  useFlipList,
  useHeldValue,
} from '../lib/dnd';
import {
  buildTagsRows,
  dragRows,
  moveRow,
  projectDepth,
  resolveTagsMove,
  resolveTreeDrop,
  tagIdOfRow,
  type RowEdge,
  type TagsDrop,
  type TagsRow,
} from '@/components/tags/tagsLayout';
import {
  TagActionSheet,
  TagContextMenu,
  type TagRowActionHandlers,
} from '@/components/tags/TagRowActions';
import { tagForest, type TagForest } from '@/components/tags/tagTree';
import { useSwipeToSelect } from '../lib/useSwipeToSelect';

const PRESET_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#6B7280',
];

/** 每级缩进（rem）；拖拽时横向每移动一档（px）加 / 减一层。 */
const INDENT_REM = 1.25;
const INDENT_PX = INDENT_REM * 16;

/** 松手后先按本地结果渲染，直到 Tag 列表（顺序与父 Tag）追上。 */
function tagsSignature(tags: TagResponseDto[]) {
  return tags.map((tag) => `${tag.id}:${tag.parentId ?? ''}`).join('|');
}

/** 折叠状态只存本机，不同步（localStorage）。 */
const COLLAPSED_KEY = 'taskora:tags-collapsed';

function useCollapsedTags(): [ReadonlySet<string>, (tagId: string, collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as unknown;
      return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  });
  const set = React.useCallback((tagId: string, value: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (value) next.add(tagId);
      else next.delete(tagId);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // 存不下就只在本次会话生效
      }
      return next;
    });
  }, []);
  return [collapsed, set];
}

/** 「新建」行：parentId 为 null 时是顶层 Tag，否则是该 Tag 的子 Tag。 */
type Pending = { parentId: string | null } | null;

/** 拖拽中的状态：实时重排后的行、被拖 Tag 投影出的层级。 */
interface DragState {
  tagId: string;
  startDepth: number;
  rows: TagsRow[];
  depth: number;
}

/**
 * Tags 管理页（tags-things3-v2 issue 05）：Tag 树的大纲，层级缩进、可折叠。
 * 拖拽沿用 `lib/dnd.ts` 的让位约定（浮层跟手、空位跟随、FLIP 滑动、松手
 * 后本地占位），上下决定位置、左右决定层级（见 tagsLayout）；「移到…」
 * 不拖拽也能改层级；点名称直接改名、点色点换色。删除先隐藏，toast 关闭后才提交，
 * 期间可撤销；删除父 Tag 时子 Tag 提升为顶层。
 */
export default function Tags() {
  const { t } = useTranslation();
  const { data: serverTags = [], isLoading } = useTagsQuery();
  const [tags, holdTags] = useHeldValue(serverTags, tagsSignature);
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const reorderTags = useReorderTags();

  const [pending, setPending] = React.useState<Pending>(null);
  // 待提交的删除：先从页面隐藏，撤销即恢复（子 Tag 在等待期间即显示到顶层）
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useCollapsedTags();
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  // 碰撞检测里记下的目标行与指针所在半边（onDragMove 每次都读）
  const targetRef = React.useRef<{ tagId: string; edge: RowEdge } | null>(null);

  const forest = React.useMemo(
    () => tagForest(tags.filter((tag) => !hidden.has(tag.id))),
    [tags, hidden],
  );
  const rows = React.useMemo(() => buildTagsRows(forest, collapsed), [forest, collapsed]);
  const displayRows = drag?.rows ?? rows;
  const flip = useFlipList<HTMLDivElement>(displayRows);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const onSaveError = () => toast.error(t('common:saveFailed'));

  const applyDrop = (drop: TagsDrop | null) => {
    if (!drop) return;
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    holdTags(
      drop.tagOrder.flatMap((id) => {
        const tag = byId.get(id);
        if (!tag) return [];
        return id === drop.tagId && drop.parentChange !== undefined
          ? [{ ...tag, parentId: drop.parentChange }]
          : [tag];
      }),
    );
    // 挂到折叠着的父 Tag 下时展开它，落点可见
    if (drop.parentChange) setCollapsed(drop.parentChange, false);
    if (drop.parentChange !== undefined) {
      updateTag.mutate(
        { id: drop.tagId, data: { parentId: drop.parentChange } },
        { onError: onSaveError },
      );
    }
    reorderTags.mutate(drop.tagOrder, { onError: onSaveError });
  };

  const updateDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  // 指针落在哪一行、在它的上半还是下半（与侧边栏项目同一判定）
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    if (!args.pointerCoordinates) return [];
    const [collision] = pointerWithin(args);
    if (!collision) return [];
    const rect = args.droppableRects.get(collision.id);
    const edge: RowEdge =
      rect && args.pointerCoordinates.y >= rect.top + rect.height / 2 ? 'after' : 'before';
    targetRef.current = { tagId: tagIdOfRow(String(collision.id)), edge };
    return [collision];
  }, []);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const tagId = tagIdOfRow(String(active.id));
    const row = rows.find((it) => it.tag.id === tagId);
    if (!row) return;
    targetRef.current = null;
    flip.capture();
    updateDrag({ tagId, startDepth: row.depth, rows: dragRows(rows, tagId), depth: row.depth });
  };

  const handleDragMove = ({ delta }: DragMoveEvent) => {
    const current = dragRef.current;
    if (!current) return;
    const target = targetRef.current;
    const moved = target ? moveRow(current.rows, current.tagId, target.tagId, target.edge) : null;
    const nextRows = moved ?? current.rows;
    const depth = projectDepth(nextRows, current.tagId, current.startDepth, delta.x, INDENT_PX);
    if (!moved && depth === current.depth) return;
    if (moved) flip.capture();
    updateDrag({ ...current, rows: nextRows, depth });
  };

  const handleDragEnd = () => {
    const current = dragRef.current;
    updateDrag(null);
    if (!current) return;
    applyDrop(resolveTreeDrop(forest, current.rows, current.tagId, current.depth));
  };

  const draggedTag = drag ? forest.byId.get(drag.tagId) : undefined;

  /** 隐藏后弹出可撤销的 toast，toast 关闭（自动或手动）时才真正删除。 */
  const removeTag = (tag: TagResponseDto) => {
    const hasChildren = forest.tree.childrenOf(tag.id).length > 0;
    setHidden((prev) => new Set(prev).add(tag.id));
    let undone = false;
    let committed = false;
    const finish = () => {
      if (undone || committed) return;
      committed = true;
      deleteTag.mutate(tag.id, { onError: () => toast.error(t('common:deleteFailed')) });
    };
    toast(hasChildren ? t('tag:deletedChildrenPromoted') : t('tag:deleted'), {
      action: {
        label: t('common:undo'),
        onClick: () => {
          undone = true;
          setHidden((prev) => {
            const next = new Set(prev);
            next.delete(tag.id);
            return next;
          });
        },
      },
      onAutoClose: finish,
      onDismiss: finish,
    });
  };

  const addChild = (parentId: string | null) => {
    if (parentId) setCollapsed(parentId, false);
    setPending({ parentId });
  };

  const submitNewTag = (parentId: string | null, title: string) => {
    setPending(null);
    if (!title) return;
    createTag.mutate({ title, parentId }, { onError: () => toast.error(t('common:createFailed')) });
  };

  const pendingRow = (parentId: string | null, depth: number) =>
    pending && pending.parentId === parentId ? (
      <div
        className="flex items-center gap-2.5 py-1.5 pr-3"
        style={{ paddingLeft: `${2.25 + depth * INDENT_REM}rem` }}
      >
        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/40" />
        <TitleInput
          initial=""
          placeholder={t('tag:titlePlaceholder')}
          onSubmit={(title) => submitNewTag(parentId, title)}
          onCancel={() => setPending(null)}
        />
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-title-1">{t('nav:tags')}</h1>
        <Button onClick={() => addChild(null)}>{t('tag:create')}</Button>
      </div>

      {isLoading ? null : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={() => updateDrag(null)}
        >
          <div ref={flip.rootRef} {...dndListProps} className="flex flex-col">
            {pendingRow(null, 0)}
            {displayRows.map((row) => (
              <React.Fragment key={row.id}>
                <TagRow
                  row={row}
                  forest={forest}
                  collapsed={collapsed.has(row.tag.id)}
                  placeholderDepth={drag?.tagId === row.tag.id ? drag.depth : undefined}
                  onToggleCollapsed={() => setCollapsed(row.tag.id, !collapsed.has(row.tag.id))}
                  onRename={(title) =>
                    updateTag.mutate({ id: row.tag.id, data: { title } }, { onError: onSaveError })
                  }
                  onRecolor={(color) =>
                    updateTag.mutate({ id: row.tag.id, data: { color } }, { onError: onSaveError })
                  }
                  onDelete={() => removeTag(row.tag)}
                  onAddChild={() => addChild(row.tag.id)}
                  onMove={(parentId) => applyDrop(resolveTagsMove(forest, row.tag.id, parentId))}
                />
                {pendingRow(row.tag.id, row.depth + 1)}
              </React.Fragment>
            ))}
            {rows.length === 0 && !pending && (
              <p className="py-1 pl-9 text-xs text-muted-foreground/60">{t('tag:empty')}</p>
            )}
          </div>
          <DragOverlay className={dragOverlayWrapperClass} dropAnimation={dropAnimation}>
            {draggedTag ? (
              <div
                className={cn(dragOverlayClass, 'bg-card')}
                aria-hidden="true"
                {...{ inert: '' }}
              >
                <div className="flex items-center gap-2.5 px-3 py-1.5 text-sm max-md:py-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: draggedTag.color }}
                  />
                  <span className="truncate">{draggedTag.title}</span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

interface TagRowProps extends TagRowActionHandlers {
  row: TagsRow;
  forest: TagForest;
  collapsed: boolean;
  /** 拖拽中这一行是空位：按投影出的层级缩进，显示落点。 */
  placeholderDepth?: number;
  onToggleCollapsed: () => void;
  onRename: (title: string) => void;
  onRecolor: (color: string) => void;
}

/**
 * 一行 Tag：整行是拖拽源与落点；行上只有折叠三角、色点（换色）、名称
 * （改名）与进入详情的箭头。其余操作在桌面端右键菜单、触控端左滑后的
 * 动作面板里（与任务行同一套左滑手势，和长按拖拽互斥）。
 */
function TagRow({
  row,
  forest,
  collapsed,
  placeholderDepth,
  onToggleCollapsed,
  onRename,
  onRecolor,
  ...actions
}: TagRowProps) {
  const { t } = useTranslation();
  const { tag } = row;
  const drag = useDraggable({ id: row.id });
  const drop = useDroppable({ id: row.id });
  const setNodeRef = (node: HTMLElement | null) => {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
  };
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const swipe = useSwipeToSelect(() => setSheetOpen(true));
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const placeholder = placeholderDepth !== undefined;

  return (
    <>
      <TagContextMenu tagId={tag.id} forest={forest} {...actions}>
        <div
          ref={setNodeRef}
          {...flipId(row.id)}
          {...drag.listeners}
          style={
            {
              '--placeholder-left': `${0.25 + (placeholderDepth ?? 0) * INDENT_REM}rem`,
            } as React.CSSProperties
          }
          data-tag-row={tag.id}
          className={cn(
            'relative',
            // 空位：内容不可见，留出与真实行等高的位置；缩进处的浅色条标出落点层级
            placeholder &&
              '[&>*]:invisible before:absolute before:inset-y-1 before:left-[var(--placeholder-left)] before:right-1 before:rounded-md before:bg-primary/10 before:ring-1 before:ring-primary/30',
          )}
        >
          <div className="relative" {...swipe.handlers}>
            {/* 左滑露出的操作指示：宽度跟随位移，越过阈值后高亮。 */}
            {swipe.offset < 0 && (
              <div
                aria-hidden
                className={cn(
                  'absolute inset-y-0 right-0 flex items-center justify-center overflow-hidden transition-colors',
                  swipe.armed ? 'text-primary' : 'text-muted-foreground',
                )}
                style={{ width: -swipe.offset }}
              >
                <MoreHorizontal className="h-5 w-5 shrink-0" />
              </div>
            )}
            <div
              className={cn(
                'flex items-center gap-2.5 rounded-lg py-1.5 pr-3 text-sm hover:bg-accent max-md:py-2.5',
                // 横向手势交给左滑，纵向仍由浏览器滚动列表
                'touch-pan-y',
                swipe.offset === 0 && 'transition-[background-color,transform] duration-fast',
              )}
              style={{
                paddingLeft: `${0.75 + (placeholderDepth ?? row.depth) * INDENT_REM}rem`,
                transform: swipe.offset !== 0 ? `translateX(${swipe.offset}px)` : undefined,
              }}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  aria-label={collapsed ? t('tag:expand') : t('tag:collapse')}
                  aria-expanded={!collapsed}
                  onClick={onToggleCollapsed}
                  className="-mx-1 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <Chevron className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span aria-hidden className="-mx-1 h-4 w-4 shrink-0" />
              )}
              <ColorDot color={tag.color} onChange={onRecolor} />
              <EditableTitle
                value={tag.title}
                placeholder={t('tag:titlePlaceholder')}
                onSubmit={onRename}
              />
              <Link
                to={`/tags/${tag.id}`}
                aria-label={tag.title}
                className="text-muted-foreground hover:text-foreground max-md:-mr-2 max-md:p-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </TagContextMenu>
      <TagActionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        tagId={tag.id}
        title={tag.title}
        forest={forest}
        {...actions}
      />
    </>
  );
}

/** 点击名称进入编辑：Enter / 失焦保存，Esc 放弃；空名称不保存。 */
function EditableTitle({
  value,
  placeholder,
  className,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  className?: string;
  onSubmit: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = React.useState(false);
  if (editing) {
    return (
      <TitleInput
        initial={value}
        placeholder={placeholder}
        onSubmit={(title) => {
          setEditing(false);
          if (title && title !== value) onSubmit(title);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`${t('tag:rename')} ${value}`}
      onClick={() => setEditing(true)}
      className={cn('min-w-0 flex-1 truncate text-left', className)}
    >
      {value || placeholder}
    </button>
  );
}

function TitleInput({
  initial,
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState(initial);
  // Esc 后的 blur 不再提交
  const done = React.useRef(false);
  const finish = (submit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (submit) onSubmit(draft.trim());
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
      // 在输入框里按下不开始拖拽（整行是拖拽源）
      onPointerDown={(e) => e.stopPropagation()}
      className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

function ColorDot({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const { t } = useTranslation();
  const [hex, setHex] = React.useState(color);
  React.useEffect(() => setHex(color), [color]);
  const commitHex = () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(hex) && hex !== color) onChange(hex);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('tag:changeColor')}
          className="h-3 w-3 shrink-0 rounded-full max-md:h-4 max-md:w-4"
          style={{ backgroundColor: color }}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => c !== color && onChange(c)}
              className={cn(
                'h-6 w-6 rounded-full max-md:h-8 max-md:w-8',
                color === c && 'ring-2 ring-ring ring-offset-2',
              )}
              style={{ backgroundColor: c }}
              aria-label={t('tag:selectColor', { color: c })}
            />
          ))}
          <input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => e.key === 'Enter' && commitHex()}
            className="w-24 rounded-md border border-input bg-transparent px-2 py-1 text-xs"
            placeholder="#3B82F6"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

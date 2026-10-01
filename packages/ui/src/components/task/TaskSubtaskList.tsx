import * as React from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CircleSlash, GripVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { SubtaskResponseDto } from '@taskora/shared';
import { dndListProps, useHeldOrder } from '../../lib/dnd';
import {
  useCancelSubtask,
  useCompleteSubtask,
  useCreateSubtask,
  useDeleteSubtask,
  useReorderSubtasks,
  useUncancelSubtask,
  useUncompleteSubtask,
  useUpdateSubtask,
} from '@taskora/api';

import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { MenuRow } from '@/components/common/MenuRow';
import { useLongPress } from '../../lib/useLongPress';
import { cn } from '@/lib/utils';
import { TaskCheckbox } from './TaskCheckbox';

export interface TaskSubtaskListHandle {
  /** 在末尾打开一条新子任务的输入并聚焦（底栏「添加子任务」）。 */
  startDraft: () => void;
}

interface Props {
  taskId: string;
  subtasks: SubtaskResponseDto[];
}

/**
 * 草稿行：尚未落库的新子任务输入，有文字才创建（空行不进库、不同步）。
 * afterId 为插入锚点；index 是锚点行尚未出现（乐观行未写入）时的兜底位置。
 */
interface Draft {
  afterId: string | null;
  index: number;
}

const DRAFT_KEY = '__draft__';

const INPUT_CLASS =
  'h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-body font-normal shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 max-md:h-11';

function focusEnd(el: HTMLInputElement) {
  el.focus();
  const end = el.value.length;
  el.setSelectionRange(end, end);
}

/** 粘贴内容并入当前输入后按行拆分；单行粘贴返回 null（走默认行为）。 */
function pastedLines(e: React.ClipboardEvent<HTMLInputElement>): string[] | null {
  const text = e.clipboardData.getData('text');
  if (!/\r?\n/.test(text)) return null;
  const el = e.currentTarget;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const merged = el.value.slice(0, start) + text + el.value.slice(end);
  return merged
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * 展开任务里的子任务清单（参考 Things 3 Checklist）：无标题、细线分隔，
 * 每项就地可编辑；Enter 在当前项下方插入、空项上 Backspace 删除、↑↓ 在项间移动、
 * 多行粘贴拆成多项；拖拽把手排序。
 */
export const TaskSubtaskList = React.forwardRef<TaskSubtaskListHandle, Props>(
  function TaskSubtaskList({ taskId, subtasks: sourceSubtasks }, ref) {
    const { t } = useTranslation();
    // 松手后先按本地顺序渲染，等乐观更新追上，避免条目闪回原位。
    const [subtasks, holdOrder] = useHeldOrder(sourceSubtasks, subtaskKey);
    const createSubtask = useCreateSubtask();
    const deleteSubtask = useDeleteSubtask();
    const reorderSubtasks = useReorderSubtasks();

    const [draft, setDraft] = React.useState<Draft | null>(null);
    const [draftText, setDraftText] = React.useState('');

    const inputs = React.useRef(new Map<string, HTMLInputElement>());
    // 目标输入框尚未渲染（新草稿 / 乐观行未写入）时挂起的聚焦请求，渲染后兑现。
    const pendingFocus = React.useRef<string | null>(null);

    React.useLayoutEffect(() => {
      const key = pendingFocus.current;
      const el = key ? inputs.current.get(key) : undefined;
      if (!el) return;
      pendingFocus.current = null;
      focusEnd(el);
    });

    const register = (key: string) => (el: HTMLInputElement | null) => {
      if (el) inputs.current.set(key, el);
      else inputs.current.delete(key);
    };

    const focusKey = (key: string) => {
      const el = inputs.current.get(key);
      if (el) {
        focusEnd(el);
      } else {
        pendingFocus.current = key;
      }
    };

    const draftPos = (() => {
      if (!draft) return -1;
      const anchor = draft.afterId ? subtasks.findIndex((s) => s.id === draft.afterId) : -1;
      return anchor >= 0 ? anchor + 1 : Math.min(draft.index, subtasks.length);
    })();
    const keys = subtasks.map((s) => s.id);
    if (draft) keys.splice(draftPos, 0, DRAFT_KEY);

    const create = (title: string, afterId: string | undefined) => {
      const id = crypto.randomUUID();
      createSubtask.mutate(
        { taskId, data: { id, title, ...(afterId ? { afterId } : {}) } },
        { onError: () => toast.error(t('task:subtaskCreateFailed')) },
      );
      return id;
    };

    /** 按顺序连续插入多项，返回最后一项的 id。 */
    const createChain = (titles: string[], afterId: string | undefined) =>
      titles.reduce<string | undefined>((anchor, title) => create(title, anchor), afterId);

    const draftAnchor = () =>
      draft?.afterId ?? (draftPos > 0 ? subtasks[draftPos - 1]?.id : undefined);

    const openDraft = (next: Draft) => {
      setDraft(next);
      setDraftText('');
      pendingFocus.current = DRAFT_KEY;
    };

    React.useImperativeHandle(ref, () => ({
      startDraft: () => openDraft({ afterId: subtasks.at(-1)?.id ?? null, index: subtasks.length }),
    }));

    const closeDraft = () => {
      setDraft(null);
      setDraftText('');
    };

    const moveFocus = (key: string, delta: -1 | 1) => {
      const target = keys[keys.indexOf(key) + delta];
      if (!target) return false;
      focusKey(target);
      return true;
    };

    const removeSubtask = (id: string) => {
      const index = subtasks.findIndex((s) => s.id === id);
      const neighbour = subtasks[index - 1] ?? subtasks[index + 1];
      if (neighbour) focusKey(neighbour.id);
      deleteSubtask.mutate({ id, taskId });
    };

    const submitDraft = () => {
      const title = draftText.trim();
      if (!title) {
        // 空草稿上 Enter：结束输入，回到上一项
        const prev = keys[draftPos - 1];
        closeDraft();
        if (prev) focusKey(prev);
        return;
      }
      const id = create(title, draftAnchor());
      // 新项落在草稿原位，草稿顺延到它之后，继续输入下一项
      openDraft({ afterId: id, index: draftPos });
    };

    const sensors = useSensors(
      useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
      useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    );

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const ids = subtasks.map((s) => s.id);
      const orderedIds = arrayMove(
        ids,
        ids.indexOf(String(active.id)),
        ids.indexOf(String(over.id)),
      );
      holdOrder(orderedIds);
      reorderSubtasks.mutate(
        { taskId, orderedIds },
        { onError: () => toast.error(t('common:saveFailed')) },
      );
    };

    if (subtasks.length === 0 && !draft) return null;

    const draftRow = (
      <li key={DRAFT_KEY} className="flex min-h-7 items-center gap-2 text-body max-md:min-h-11">
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-muted-foreground/40"
        />
        <Input
          ref={register(DRAFT_KEY)}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => {
            if (pendingFocus.current === DRAFT_KEY) return;
            const title = draftText.trim();
            if (title) create(title, draftAnchor());
            closeDraft();
          }}
          onPaste={(e) => {
            const lines = pastedLines(e);
            if (!lines) return;
            e.preventDefault();
            const last = createChain(lines, draftAnchor());
            openDraft({ afterId: last ?? draft?.afterId ?? null, index: draftPos });
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              submitDraft();
            } else if (e.key === ' ') {
              e.stopPropagation();
            } else if (e.key === 'Backspace' && draftText === '') {
              e.preventDefault();
              e.stopPropagation();
              const prev = keys[draftPos - 1];
              closeDraft();
              if (prev) focusKey(prev);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.stopPropagation();
              if (moveFocus(DRAFT_KEY, e.key === 'ArrowUp' ? -1 : 1)) e.preventDefault();
            }
          }}
          placeholder={t('task:addSubtask')}
          className={cn(INPUT_CLASS, 'placeholder:text-muted-foreground/70')}
        />
      </li>
    );

    const rows = subtasks.map((subtask) => (
      <SubtaskRow
        key={subtask.id}
        subtask={subtask}
        inputRef={register(subtask.id)}
        onEnter={() => openDraft({ afterId: subtask.id, index: subtasks.indexOf(subtask) + 1 })}
        onBackspaceEmpty={() => removeSubtask(subtask.id)}
        onDelete={() => removeSubtask(subtask.id)}
        onArrow={(delta) => moveFocus(subtask.id, delta)}
        onPasteLines={(rest) => {
          const last = createChain(rest, subtask.id);
          if (last) focusKey(last);
        }}
      />
    ));
    if (draft) rows.splice(draftPos, 0, draftRow);

    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul {...dndListProps} className="flex flex-col divide-y divide-border/60">
            {rows}
          </ul>
        </SortableContext>
      </DndContext>
    );
  },
);

function SubtaskRow({
  subtask,
  inputRef,
  onEnter,
  onBackspaceEmpty,
  onDelete,
  onArrow,
  onPasteLines,
}: {
  subtask: SubtaskResponseDto;
  inputRef: (el: HTMLInputElement | null) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onDelete: () => void;
  /** 移到上/下一项；返回是否移动了（到头时保留输入框默认的光标行为）。 */
  onArrow: (delta: -1 | 1) => boolean;
  /** 多行粘贴：首行并入本项，其余行作为新项插在本项之后。 */
  onPasteLines: (rest: string[]) => void;
}) {
  const { t } = useTranslation();
  const completeSubtask = useCompleteSubtask();
  const uncompleteSubtask = useUncompleteSubtask();
  const cancelSubtask = useCancelSubtask();
  const uncancelSubtask = useUncancelSubtask();
  const updateSubtask = useUpdateSubtask();
  const completed = subtask.status === 'COMPLETED';
  const cancelled = subtask.status === 'CANCELLED';
  const settled = completed || cancelled;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id });

  const [value, setValue] = React.useState(subtask.title);
  const localRef = React.useRef<HTMLInputElement | null>(null);
  // 远端改名同步进来；正在编辑时不覆盖用户输入。
  React.useEffect(() => {
    if (document.activeElement !== localRef.current) setValue(subtask.title);
  }, [subtask.title]);

  const saveTitle = (title: string) => {
    updateSubtask.mutate(
      { id: subtask.id, data: { title } },
      { onError: () => toast.error(t('common:saveFailed')) },
    );
  };

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== subtask.title) {
      saveTitle(trimmed);
    } else {
      setValue(subtask.title);
    }
  };

  // 右键菜单（取消/撤销取消、删除）：勾选框仍只管完成/重开，取消只走菜单（story 22）。
  const [menuOpen, setMenuOpen] = React.useState(false);
  const virtualAnchorRef = React.useRef<{ getBoundingClientRect: () => ClientRect } | null>(null);

  const openMenuAt = (x: number, y: number) => {
    virtualAnchorRef.current = {
      getBoundingClientRect: () =>
        ({
          width: 0,
          height: 0,
          x,
          y,
          top: y,
          right: x,
          bottom: y,
          left: x,
          toJSON: () => ({}),
        }) as ClientRect,
    };
    setMenuOpen(true);
  };

  // 触屏长按与右键走同一菜单。
  const longPress = useLongPress((p) => openMenuAt(p.x, p.y));

  const toggleCancel = () => {
    setMenuOpen(false);
    (cancelled ? uncancelSubtask : cancelSubtask).mutate(subtask.id, {
      onError: () => toast.error(t('common:saveFailed')),
    });
  };

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(
        'group/subtask relative flex min-h-7 items-center gap-2 bg-card text-body max-md:min-h-11',
        isDragging && 'opacity-80 shadow-row-lift',
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenuAt(e.clientX, e.clientY);
      }}
      {...longPress}
    >
      <TaskCheckbox
        className="h-3 w-3 rounded-full"
        checked={completed}
        cancelled={cancelled}
        onToggle={() => (completed ? uncompleteSubtask : completeSubtask).mutate(subtask.id)}
      />
      <Input
        ref={(el) => {
          localRef.current = el;
          inputRef(el);
        }}
        aria-label={t('task:subtasks')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onPaste={(e) => {
          const lines = pastedLines(e);
          if (!lines) return;
          e.preventDefault();
          const [first, ...rest] = lines;
          if (!first) return;
          setValue(first);
          if (first !== subtask.title) saveTitle(first);
          onPasteLines(rest);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            // 改名由失焦提交（焦点随即移到新草稿行）
            e.preventDefault();
            e.stopPropagation();
            onEnter();
          } else if (e.key === ' ') {
            e.stopPropagation();
          } else if (e.key === 'Backspace' && value === '') {
            e.preventDefault();
            e.stopPropagation();
            onBackspaceEmpty();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.stopPropagation();
            if (onArrow(e.key === 'ArrowUp' ? -1 : 1)) e.preventDefault();
          }
        }}
        className={cn(INPUT_CLASS, settled && 'text-muted-foreground', cancelled && 'line-through')}
      />

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t('task:reorderSubtask')}
        // 把手上的按压只用于拖拽，不触发行的长按菜单
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60 opacity-0 focus-visible:opacity-100 group-hover/subtask:opacity-100 active:cursor-grabbing max-md:h-11 max-md:w-11 max-md:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent align="start" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
          <MenuRow icon={CircleSlash} onClick={toggleCancel}>
            {cancelled ? t('task:markUncancelled') : t('task:markCancelled')}
          </MenuRow>
          <MenuRow
            icon={Trash2}
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
          >
            {t('common:delete')}
          </MenuRow>
        </PopoverContent>
      </Popover>
    </li>
  );
}

function subtaskKey(subtask: SubtaskResponseDto) {
  return subtask.id;
}

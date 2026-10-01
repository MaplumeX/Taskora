import * as React from 'react';
import { ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { TagResponseDto } from '@taskora/shared';
import {
  useCreateTag,
  useCreateTagGroup,
  useDeleteTag,
  useDeleteTagGroup,
  useReorderTagGroups,
  useReorderTags,
  useTagGroupsQuery,
  useTagsQuery,
  useUpdateTag,
  useUpdateTagGroup,
} from '@taskora/api';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { dndListProps } from '../lib/dnd';
import { buildTagsRows, resolveTagsDrop, type TagsRow } from '@/components/tags/tagsLayout';

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

/** 「新建」行插在哪：某个 Group 下 / 未分组区（null）/ 新建 Group。 */
type Pending = { kind: 'tag'; groupId: string | null } | { kind: 'group' } | null;

/**
 * Tags 管理页（tags-things3 issue 07）：Group 小标题加成员 Tag 的大纲。
 * 拖拽排序（跨组即改归属）、点名称直接改名、点色点换色；删除先隐藏，
 * toast 关闭后才提交，期间可撤销。
 */
export default function Tags() {
  const { t } = useTranslation();
  const { data: tags = [], isLoading } = useTagsQuery();
  const { data: groups = [] } = useTagGroupsQuery();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const reorderTags = useReorderTags();
  const createGroup = useCreateTagGroup();
  const updateGroup = useUpdateTagGroup();
  const deleteGroup = useDeleteTagGroup();
  const reorderGroups = useReorderTagGroups();

  const [pending, setPending] = React.useState<Pending>(null);
  // 待提交的删除：先从页面隐藏，撤销即恢复
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(new Set());

  const rows = React.useMemo(
    () =>
      buildTagsRows(
        tags.filter((tag) => !hidden.has(tag.id)),
        groups.filter((group) => !hidden.has(group.id)),
      ),
    [tags, groups, hidden],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onSaveError = () => toast.error(t('common:saveFailed'));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const drop = resolveTagsDrop(rows, String(active.id), String(over.id));
    if (!drop) return;
    if (drop.kind === 'group') {
      reorderGroups.mutate(drop.groupOrder, { onError: onSaveError });
      return;
    }
    if (drop.groupChange !== undefined) {
      updateTag.mutate(
        { id: drop.tagId, data: { tagGroupId: drop.groupChange } },
        { onError: onSaveError },
      );
    }
    reorderTags.mutate(drop.tagOrder, { onError: onSaveError });
  };

  /** 隐藏后弹出可撤销的 toast，toast 关闭（自动或手动）时才真正删除。 */
  const deleteWithUndo = (id: string, message: string, commit: () => void) => {
    setHidden((prev) => new Set(prev).add(id));
    let undone = false;
    let committed = false;
    const finish = () => {
      if (undone || committed) return;
      committed = true;
      commit();
    };
    toast(message, {
      action: {
        label: t('common:undo'),
        onClick: () => {
          undone = true;
          setHidden((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
      onAutoClose: finish,
      onDismiss: finish,
    });
  };

  const removeTag = (tag: TagResponseDto) =>
    deleteWithUndo(tag.id, t('tag:deleted'), () =>
      deleteTag.mutate(tag.id, { onError: () => toast.error(t('common:deleteFailed')) }),
    );

  const removeGroup = (groupId: string) =>
    deleteWithUndo(groupId, t('tag:groupDeletedUndo'), () =>
      deleteGroup.mutate(groupId, { onError: () => toast.error(t('common:deleteFailed')) }),
    );

  const submitNewTag = (groupId: string | null, title: string) => {
    setPending(null);
    if (!title) return;
    createTag.mutate(
      { title, tagGroupId: groupId },
      { onError: () => toast.error(t('common:createFailed')) },
    );
  };

  const submitNewGroup = (title: string) => {
    setPending(null);
    if (!title) return;
    createGroup.mutate({ title }, { onError: () => toast.error(t('common:createFailed')) });
  };

  const pendingTagRow = (groupId: string | null) =>
    pending?.kind === 'tag' && pending.groupId === groupId ? (
      <div className="flex items-center gap-2.5 py-1.5 pl-9 pr-3">
        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/40" />
        <TitleInput
          initial=""
          placeholder={t('tag:titlePlaceholder')}
          onSubmit={(title) => submitNewTag(groupId, title)}
          onCancel={() => setPending(null)}
        />
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-title-1">{t('nav:tags')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPending({ kind: 'group' })}>
            {t('tag:newGroup')}
          </Button>
          <Button onClick={() => setPending({ kind: 'tag', groupId: null })}>
            {t('tag:create')}
          </Button>
        </div>
      </div>

      {pending?.kind === 'group' && (
        <div className="px-3">
          <TitleInput
            initial=""
            placeholder={t('tag:groupTitlePlaceholder')}
            onSubmit={submitNewGroup}
            onCancel={() => setPending(null)}
          />
        </div>
      )}

      {isLoading ? null : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <div {...dndListProps} className="flex flex-col">
              {rows.map((row, index) => {
                const next = rows[index + 1];
                // 新建行插在所在区块的末尾
                const endsBlock = !next || next.kind !== 'tag';
                const blockGroup = blockGroupOf(rows, index);
                return (
                  <React.Fragment key={row.id}>
                    <SortableRow
                      row={row}
                      onRenameTag={(tag, title) =>
                        updateTag.mutate({ id: tag.id, data: { title } }, { onError: onSaveError })
                      }
                      onRecolorTag={(tag, color) =>
                        updateTag.mutate({ id: tag.id, data: { color } }, { onError: onSaveError })
                      }
                      onDeleteTag={removeTag}
                      onRenameGroup={(groupId, title) =>
                        updateGroup.mutate({ id: groupId, data: { title } }, { onError: onSaveError })
                      }
                      onDeleteGroup={removeGroup}
                      onAddTag={(groupId) => setPending({ kind: 'tag', groupId })}
                    />
                    {endsBlock && pendingTagRow(blockGroup)}
                    {row.kind === 'ungrouped' && !next && (
                      <p className="py-1 pl-9 text-xs text-muted-foreground/60">{t('tag:empty')}</p>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/** 行所在区块的 Group（未分组区为 null）。 */
function blockGroupOf(rows: TagsRow[], index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const row = rows[i];
    if (row.kind === 'group') return row.groupId;
    if (row.kind === 'ungrouped') return null;
  }
  return null;
}

interface RowHandlers {
  onRenameTag: (tag: TagResponseDto, title: string) => void;
  onRecolorTag: (tag: TagResponseDto, color: string) => void;
  onDeleteTag: (tag: TagResponseDto) => void;
  onRenameGroup: (groupId: string, title: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddTag: (groupId: string | null) => void;
}

function SortableRow({ row, ...handlers }: { row: TagsRow } & RowHandlers) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: row.kind === 'ungrouped',
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  const handle =
    row.kind === 'ungrouped' ? (
      <span className="h-4 w-4 shrink-0" />
    ) : (
      <button
        type="button"
        aria-label={t('tag:dragHandle')}
        className="flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    );

  if (row.kind === 'tag') {
    const { tag } = row;
    return (
      <div
        ref={setNodeRef}
        style={style}
        data-tag-row={tag.id}
        className="group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm hover:bg-accent max-md:py-2.5"
      >
        {handle}
        <ColorDot color={tag.color} onChange={(color) => handlers.onRecolorTag(tag, color)} />
        <EditableTitle
          value={tag.title}
          placeholder={t('tag:titlePlaceholder')}
          onSubmit={(title) => handlers.onRenameTag(tag, title)}
        />
        <button
          type="button"
          aria-label={t('common:delete')}
          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 max-md:-mr-2 max-md:p-2 max-md:opacity-100"
          onClick={() => handlers.onDeleteTag(tag)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <Link
          to={`/tags/${tag.id}`}
          aria-label={tag.title}
          className="text-muted-foreground hover:text-foreground max-md:-mr-2 max-md:p-2"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const groupId = row.kind === 'group' ? row.groupId : null;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group mt-3 flex items-center gap-2.5 px-3 pb-1 first:mt-0"
    >
      {handle}
      {row.kind === 'group' ? (
        <EditableTitle
          value={row.title}
          placeholder={t('tag:groupTitlePlaceholder')}
          className="text-sm font-medium text-muted-foreground"
          onSubmit={(title) => handlers.onRenameGroup(row.groupId, title)}
        />
      ) : (
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">
          {t('common:ungrouped')}
        </h2>
      )}
      <button
        type="button"
        aria-label={t('tag:addTag')}
        className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 max-md:p-2 max-md:opacity-100"
        onClick={() => handlers.onAddTag(groupId)}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {groupId && (
        <button
          type="button"
          aria-label={t('tag:deleteGroup')}
          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 max-md:-mr-2 max-md:p-2 max-md:opacity-100"
          onClick={() => handlers.onDeleteGroup(groupId)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
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

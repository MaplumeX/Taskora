import * as React from 'react';
import { ArrowLeft, CornerDownRight, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MenuRow } from '@/components/common/MenuRow';
import { ActionSheet, ActionSheetContent, ActionSheetItem } from '@/components/ui/action-sheet';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { isTouchContextMenu } from '../../lib/useLongPress';
import { canNestUnder } from './tagsLayout';
import { flattenTagTree, type TagForest } from './tagTree';

/**
 * Tags 管理页的行操作（tags-things3-v2 issue 05）：新建子 Tag、移到…、删除。
 * 桌面端右键弹出菜单（TagContextMenu）；触控端左滑弹出底部动作面板
 * （TagActionSheet）——与任务、项目一样，触控长按只负责拖动。改名、改色
 * 留在行上直接点。
 */
export interface TagRowActionHandlers {
  onAddChild: () => void;
  /** 挂到 parentId 下（null 为顶层）。 */
  onMove: (parentId: string | null) => void;
  onDelete: () => void;
}

const INDENT_REM = 1.25;

/** 「移到…」的候选：顶层 + Tag 树；自己和自己的后代不可选，当前父 Tag 打勾。 */
function MoveTargets({
  tagId,
  forest,
  onPick,
  large = false,
}: {
  tagId: string;
  forest: TagForest;
  onPick: (parentId: string | null) => void;
  /** 动作面板里用大触控目标。 */
  large?: boolean;
}) {
  const { t } = useTranslation();
  const current = forest.tree.parentOf(tagId);
  const targets = React.useMemo(
    () => flattenTagTree(forest).filter(({ tag }) => canNestUnder(forest, tagId, tag.id)),
    [forest, tagId],
  );
  const option = (parentId: string | null, label: React.ReactNode, depth: number) => (
    <button
      key={parentId ?? 'top'}
      type="button"
      role="menuitemradio"
      aria-checked={parentId === current}
      onClick={() => onPick(parentId)}
      className={cn(
        'flex w-full items-center gap-2 rounded-md pr-2 text-left hover:bg-accent',
        large ? 'h-12 text-[15px] active:bg-accent' : 'py-1.5 text-sm max-md:py-2.5',
        parentId === current && 'font-medium',
      )}
      style={{ paddingLeft: `${(large ? 1 : 0.5) + depth * INDENT_REM}rem` }}
    >
      {label}
    </button>
  );
  return (
    <div
      role="menu"
      aria-label={t('tag:moveTo')}
      className={cn('flex flex-col overflow-y-auto', large ? 'max-h-[60dvh]' : 'max-h-72')}
    >
      {option(null, t('tag:moveToTop'), 0)}
      {targets.map(({ tag, depth }) =>
        option(
          tag.id,
          <>
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            <span className="truncate">{tag.title}</span>
          </>,
          depth,
        ),
      )}
    </div>
  );
}

/** 桌面端：右键以指针位置为锚点打开菜单；「移到…」在同一个浮层里切换成 Tag 树。 */
export function TagContextMenu({
  tagId,
  forest,
  children,
  ...actions
}: TagRowActionHandlers & {
  tagId: string;
  forest: TagForest;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const firstItemRef = React.useRef<HTMLButtonElement>(null);
  const anchorRef = React.useRef<{ getBoundingClientRect: () => DOMRect } | null>(null);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // 触屏长按派发的 contextmenu 不开菜单：长按只负责拖动，操作走左滑
    if (isTouchContextMenu(e)) return;
    const { clientX: x, clientY: y } = e;
    anchorRef.current = { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
    setMoving(false);
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => firstItemRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, moving]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div onContextMenu={onContextMenu}>
      {children}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor virtualRef={anchorRef} />
        <PopoverContent
          align="start"
          className={cn('p-1', moving ? 'w-60' : 'w-44')}
          onClick={(e) => e.stopPropagation()}
        >
          {moving ? (
            <MoveTargets
              tagId={tagId}
              forest={forest}
              onPick={(parentId) => run(() => actions.onMove(parentId))}
            />
          ) : (
            <div className="flex flex-col">
              <MenuRow ref={firstItemRef} icon={Plus} onClick={() => run(actions.onAddChild)}>
                {t('tag:newChild')}
              </MenuRow>
              <MenuRow icon={CornerDownRight} onClick={() => setMoving(true)}>
                {t('tag:moveTo')}
              </MenuRow>
              <div className="-mx-1 my-1 h-px bg-muted" />
              <MenuRow icon={Trash2} destructive onClick={() => run(actions.onDelete)}>
                {t('common:delete')}
              </MenuRow>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** 触控端：左滑行后弹出的底部动作面板；「移到…」切换成 Tag 树。 */
export function TagActionSheet({
  open,
  onOpenChange,
  tagId,
  title,
  forest,
  ...actions
}: TagRowActionHandlers & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagId: string;
  /** 面板标题：Tag 名称。 */
  title: string;
  forest: TagForest;
}) {
  const { t } = useTranslation();
  const [moving, setMoving] = React.useState(false);
  React.useEffect(() => {
    if (open) setMoving(false);
  }, [open]);

  return (
    <ActionSheet open={open} onOpenChange={onOpenChange}>
      <ActionSheetContent
        title={moving ? t('tag:moveTo') : title}
        // 左滑打开，没有点击来源：不自动聚焦第一项（否则显示焦点框）
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {moving ? (
          <>
            <button
              type="button"
              onClick={() => setMoving(false)}
              className="flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] text-muted-foreground active:bg-accent"
            >
              <ArrowLeft className="h-5 w-5 shrink-0" />
              {t('common:back')}
            </button>
            <MoveTargets
              large
              tagId={tagId}
              forest={forest}
              onPick={(parentId) => {
                onOpenChange(false);
                actions.onMove(parentId);
              }}
            />
          </>
        ) : (
          <>
            <ActionSheetItem icon={Plus} onClick={actions.onAddChild}>
              {t('tag:newChild')}
            </ActionSheetItem>
            <button
              type="button"
              onClick={() => setMoving(true)}
              className="flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] transition-colors active:bg-accent"
            >
              <CornerDownRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              {t('tag:moveTo')}
            </button>
            <ActionSheetItem icon={Trash2} destructive onClick={actions.onDelete}>
              {t('common:delete')}
            </ActionSheetItem>
          </>
        )}
      </ActionSheetContent>
    </ActionSheet>
  );
}

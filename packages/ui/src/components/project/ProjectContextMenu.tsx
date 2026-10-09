import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  MoreHorizontal,
  FolderTree,
  Check,
  Circle,
  CalendarClock,
  CalendarDays,
  Copy,
  Repeat,
  SkipForward,
  Tag,
  Trash2,
  RotateCcw,
} from 'lucide-react';

import { ScheduledType, type ProjectResponseDto, type UpdateProjectDto } from '@taskora/shared';

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { MenuItems, type MenuItem } from '@/components/common/MenuItems';
import { FieldPickerDialog } from '@/components/common/FieldPicker';
import { ActionSheet, ActionSheetContent, ActionSheetTrigger } from '@/components/ui/action-sheet';
import { useIsDesktop } from '@/lib/use-media-query';
import { isTouchContextMenu } from '../../lib/useLongPress';
import { useDeleteProject, useRestoreProject, useUpdateProject } from '@taskora/api';
import { ScheduledDateField } from '@/components/task/fields/ScheduledDateField';
import { DueDateField } from '@/components/task/fields/DueDateField';
import { RepeatRuleField } from '@/components/task/fields/RepeatRuleField';
import { TagsField } from '@/components/task/fields/TagsField';
import { useDuplicate } from '@/components/task/useDuplicate';

import { ReviewPicker, useReviewMenuItem } from '@/components/review/ReviewSchedule';
import { useInReviewMode } from '@/components/review/reviewMode';

import { ProjectMovePicker } from './ProjectMovePicker';
import { useProjectCompletion } from './useProjectCompletion';
import { useSkipProjectOccurrence } from './useSkipProjectOccurrence';

export interface ProjectMenuProps {
  project: ProjectResponseDto;
  current: ProjectResponseDto;
  variant?: 'default' | 'trash';
  onDeleted?: () => void;
  /** 复制完成后（副本 id）；缺省为在列表中选中副本。 */
  onDuplicated?: (copyId: string) => void;
}

type PickerKind = 'scheduled' | 'repeat' | 'due' | 'tags' | 'move' | 'review' | null;

export function ProjectMenuPanel({
  project,
  current,
  variant = 'default',
  onDeleted,
  onDuplicated,
  onClose,
  openPicker,
  onToggleComplete,
  showReview,
  sheet,
  firstItemRef,
}: ProjectMenuProps & {
  onClose: () => void;
  openPicker: (kind: Exclude<PickerKind, null>) => void;
  /** 提供回顾一行（只有项目页的「…」菜单提供）。 */
  showReview?: boolean;
  /** 完成 / 取消完成（含剩余任务询问，见 useProjectCompletion；对话框由外层渲染）。 */
  onToggleComplete: (project: ProjectResponseDto) => void;
  /** 窄屏底部动作面板形态（须渲染在 ActionSheetContent 内）。 */
  sheet?: boolean;
  firstItemRef?: React.RefObject<HTMLButtonElement>;
}) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');

  const deleteProject = useDeleteProject();
  const restoreProject = useRestoreProject();
  const duplicate = useDuplicate();
  // 面板只在菜单打开时挂载
  const skipOccurrence = useSkipProjectOccurrence(current, true);

  const completed = current.status === 'COMPLETED';
  const isDate = (current.scheduledType ?? ScheduledType.NONE) === ScheduledType.DATE;
  const canOfferSkip = variant === 'default' && skipOccurrence.available;
  const reviewItem = useReviewMenuItem(() => openPicker('review'));

  const handleToggleComplete = () => {
    onClose();
    onToggleComplete(current);
  };

  const handleSkip = () => {
    onClose();
    skipOccurrence.skip();
  };

  const handleDuplicate = () => {
    onClose();
    void duplicate([{ id: project.id, kind: 'project' }], {
      selectCopies: !onDuplicated,
    }).then(([copyId]) => {
      if (copyId) onDuplicated?.(copyId);
    });
  };

  const handleDelete = () => {
    onClose();
    deleteProject.mutate(project.id, {
      onSuccess: () => onDeleted?.(),
      onError: () => toast.error(tc('deleteFailed')),
    });
  };

  const handleRestore = () => {
    onClose();
    restoreProject.mutate(project.id, {
      onError: () => toast.error(tc('restoreFailed')),
    });
  };

  const items: MenuItem[] = [
    {
      icon: completed ? Circle : Check,
      label: completed ? t('markIncomplete') : t('markComplete'),
      onSelect: handleToggleComplete,
    },
    {
      icon: CalendarClock,
      label: t('scheduledDate'),
      onSelect: () => openPicker('scheduled'),
      separated: true,
    },
    // 重复规则：仅 DATE 项目（规则需要计划日期作锚点，recurring-projects spec）。
    ...(isDate ? [{ icon: Repeat, label: t('repeat'), onSelect: () => openPicker('repeat') }] : []),
    ...(canOfferSkip
      ? [
          {
            icon: SkipForward,
            label: t('skipOccurrence'),
            disabled: skipOccurrence.target === null,
            title: skipOccurrence.target === null ? t('skipOccurrenceLast') : undefined,
            onSelect: handleSkip,
          },
        ]
      : []),
    { icon: CalendarDays, label: t('dueDate'), onSelect: () => openPicker('due') },
    { icon: Tag, label: t('tags'), onSelect: () => openPicker('tags') },
    { icon: FolderTree, label: t('move'), onSelect: () => openPicker('move') },
    ...(variant === 'default'
      ? [{ icon: Copy, label: t('duplicate'), onSelect: handleDuplicate }]
      : []),
    ...(showReview && variant === 'default' ? [reviewItem] : []),
    {
      icon: variant === 'trash' ? RotateCcw : Trash2,
      label: variant === 'trash' ? tc('putBack') : tc('delete'),
      onSelect: variant === 'trash' ? handleRestore : handleDelete,
      destructive: true,
      separated: true,
    },
  ];

  return (
    <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
      <MenuItems items={items} sheet={sheet} firstItemRef={firstItemRef} />
    </div>
  );
}

function useProjectPatch(project: ProjectResponseDto) {
  const { t: tc } = useTranslation('common');
  const updateProject = useUpdateProject();

  return (data: UpdateProjectDto) =>
    updateProject.mutate(
      { id: project.id, data },
      {
        onError: () => toast.error(tc('saveFailed')),
      },
    );
}

function PickerContent({
  kind,
  current,
  patch,
  onClose,
}: {
  kind: Exclude<PickerKind, null>;
  current: ProjectResponseDto;
  patch: (data: UpdateProjectDto) => void;
  onClose: () => void;
}) {
  if (kind === 'move') {
    return (
      <ProjectMovePicker
        current={current}
        onSelect={(data) => {
          patch(data);
          onClose();
        }}
      />
    );
  }
  if (kind === 'scheduled') {
    return <ScheduledDateField current={current} onPatch={patch} onClose={onClose} />;
  }
  if (kind === 'repeat') {
    return <RepeatRuleField current={current} onPatch={patch} />;
  }
  if (kind === 'due') {
    return <DueDateField current={current} onPatch={patch} onClose={onClose} />;
  }
  if (kind === 'review') {
    return <ReviewPicker target={{ kind: 'project', ...current }} />;
  }
  return <TagsField current={current} onPatch={patch} />;
}

interface ProjectContextMenuProps extends ProjectMenuProps {
  children: React.ReactNode;
}

/** 右键版：包裹 children，右键打开菜单 + picker。 */
export function ProjectContextMenu({
  project,
  current,
  variant = 'default',
  children,
}: ProjectContextMenuProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const firstItemRef = React.useRef<HTMLButtonElement>(null);
  const virtualAnchorRef = React.useRef<
    { getBoundingClientRect: () => ClientRect } | null
  >(null);

  const patch = useProjectPatch(project);
  const completion = useProjectCompletion();

  const closeMenu = () => setMenuOpen(false);

  const openPicker = (kind: Exclude<PickerKind, null>) => {
    closeMenu();
    setActivePicker(kind);
  };

  /** 以坐标为锚点打开主菜单（鼠标右键）。 */
  const openMenuAt = (x: number, y: number) => {
    virtualAnchorRef.current = {
      getBoundingClientRect: () => ({
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
    setActivePicker(null);
    setMenuOpen(true);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 触屏长按只负责拖动（对齐 Things 3），不开菜单；项目操作在项目页的
    // 更多菜单里。
    if (isTouchContextMenu(e)) return;
    openMenuAt(e.clientX, e.clientY);
  };

  // Auto-focus first menu item when opened.
  React.useEffect(() => {
    if (menuOpen) {
      const id = requestAnimationFrame(() => firstItemRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [menuOpen]);

  return (
    <div ref={containerRef} className="flex flex-col" onContextMenu={onContextMenu}>
      {children}

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent
          align="start"
          className="w-44 p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <ProjectMenuPanel
            project={project}
            current={current}
            variant={variant}
            onClose={closeMenu}
            openPicker={openPicker}
            onToggleComplete={completion.toggle}
            firstItemRef={firstItemRef}
          />
        </PopoverContent>
      </Popover>

      <Popover
        open={activePicker !== null}
        onOpenChange={(o) => !o && setActivePicker(null)}
      >
        <PopoverAnchor virtualRef={containerRef} />
        <PopoverContent align="start" onClick={(e) => e.stopPropagation()}>
          {activePicker !== null && (
            <PickerContent kind={activePicker} current={current} patch={patch} onClose={() => setActivePicker(null)} />
          )}
        </PopoverContent>
      </Popover>
      {completion.dialog}
    </div>
  );
}

/** Trigger 版：内置 MoreHorizontal 按钮，点击打开菜单 + picker；窄屏改为底部动作面板 + 字段卡片。 */
export function ProjectMoreMenu({ project, current, variant = 'default' }: ProjectMenuProps) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const { t: tr } = useTranslation('review');
  const { t: tp } = useTranslation('project');
  const navigate = useNavigate();
  const inReview = useInReviewMode();
  const isDesktop = useIsDesktop();

  // 回顾中删除：回顾会话自动进入下一个，不跳走
  const onDeleted = () => {
    if (!inReview) navigate('/today');
  };
  // 项目页里复制：打开副本；回顾中留在回顾会话，只提示。
  const onDuplicated = (copyId: string) => {
    if (inReview) toast.success(t('duplicateProjectDone'));
    else navigate(`/projects/${copyId}`);
  };
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const patch = useProjectPatch(project);
  const completion = useProjectCompletion();

  const closeMenu = () => setMenuOpen(false);

  const openPicker = (kind: Exclude<PickerKind, null>) => {
    closeMenu();
    setActivePicker(kind);
  };

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground max-md:-mr-1.5 max-md:h-11 max-md:w-11"
      aria-label={tc('more')}
    >
      <MoreHorizontal className="h-4 w-4 max-md:h-5 max-md:w-5" />
    </Button>
  );
  const panel = (sheet: boolean) => (
    <ProjectMenuPanel
      project={project}
      current={current}
      variant={variant}
      onDeleted={onDeleted}
      onDuplicated={onDuplicated}
      onClose={closeMenu}
      openPicker={openPicker}
      onToggleComplete={completion.toggle}
      showReview
      sheet={sheet}
    />
  );
  const pickerBody = activePicker !== null && (
    <PickerContent kind={activePicker} current={current} patch={patch} onClose={() => setActivePicker(null)} />
  );

  if (!isDesktop) {
    const pickerLabel: Record<Exclude<PickerKind, null>, string> = {
      scheduled: t('scheduledDate'),
      repeat: t('repeat'),
      due: t('dueDate'),
      tags: t('tags'),
      move: t('move'),
      review: tr('title'),
    };
    return (
      <>
        <ActionSheet open={menuOpen} onOpenChange={setMenuOpen}>
          <ActionSheetTrigger asChild>{trigger}</ActionSheetTrigger>
          <ActionSheetContent title={current.title || tp('defaultTitle')}>
            {panel(true)}
          </ActionSheetContent>
        </ActionSheet>
        <FieldPickerDialog
          label={activePicker ? pickerLabel[activePicker] : ''}
          open={activePicker !== null}
          onOpenChange={(o) => !o && setActivePicker(null)}
        >
          {pickerBody}
        </FieldPickerDialog>
        {completion.dialog}
      </>
    );
  }

  return (
    <div ref={containerRef}>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-44 p-1"
          onCloseAutoFocus={(e) => {
            // 打开选择器时让它接管焦点，避免焦点回到「更多」后将其关闭。
            if (activePicker !== null) e.preventDefault();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {panel(false)}
        </PopoverContent>
      </Popover>

      <Popover
        open={activePicker !== null}
        onOpenChange={(o) => !o && setActivePicker(null)}
      >
        <PopoverAnchor virtualRef={containerRef} />
        <PopoverContent align="end" onClick={(e) => e.stopPropagation()}>
          {pickerBody}
        </PopoverContent>
      </Popover>
      {completion.dialog}
    </div>
  );
}

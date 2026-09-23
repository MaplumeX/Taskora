import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Circle, CircleSlash, CalendarClock, CalendarDays, Tag, FolderInput, Trash2, RotateCcw } from 'lucide-react';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { MenuRow } from '@/components/common/MenuRow';
import { useLongPress } from '../../lib/useLongPress';
import {
  getClientKind,
  taskKeys,
  useCancelTask,
  useCompleteTask,
  useConvertTaskToProject,
  useDeleteTask,
  useRestoreTask,
  useUncancelTask,
  useUncompleteTask,
  useUpdateTask,
} from '@taskora/api';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { TagsField } from './fields/TagsField';

interface Props {
  task: TaskResponseDto;
  current: TaskResponseDto;
  children: React.ReactNode;
  variant?: 'default' | 'trash';
}

type PickerKind = 'scheduled' | 'due' | 'tags' | null;

export function TaskContextMenu({ task, current, children, variant = 'default' }: Props) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();

  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const cancelTask = useCancelTask();
  const uncancelTask = useUncancelTask();
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();
  const convertToProjectTask = useConvertTaskToProject();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const firstItemRef = React.useRef<HTMLButtonElement>(null);
  const virtualAnchorRef = React.useRef<
    { getBoundingClientRect: () => ClientRect } | null
  >(null);

  const completed = current.status === 'COMPLETED';
  const cancelled = current.status === 'CANCELLED';

  const patch = (data: UpdateTaskDto) =>
    updateTask.mutate(
      { id: task.id, data },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
          void queryClient.invalidateQueries({ queryKey: ['tasks'] });
        },
        onError: () => toast.error(tc('saveFailed')),
      },
    );

  const closeMenu = () => setMenuOpen(false);

  const handleToggleComplete = () => {
    closeMenu();
    (completed ? uncompleteTask : completeTask).mutate(task.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      },
      onError: () => toast.error(tc('saveFailed')),
    });
  };

  // 取消与完成对称：终态可直接改写（ADR 0006），随当前状态切换文案。
  const handleToggleCancel = () => {
    closeMenu();
    (cancelled ? uncancelTask : cancelTask).mutate(task.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      },
      onError: () => toast.error(tc('saveFailed')),
    });
  };

  const handleDelete = () => {
    closeMenu();
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      },
      onError: () => toast.error(t('deleteFailed')),
    });
  };

  const handleRestore = () => {
    closeMenu();
    restoreTask.mutate(task.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      },
      onError: () => toast.error(tc('restoreFailed')),
    });
  };

  const handleConvertToProject = () => {
    closeMenu();
    convertToProjectTask.mutate(task.id, {
      onSuccess: () => toast.success(t('convertSuccess')),
      onError: () => toast.error(t('convertFailed')),
    });
  };

  const openPicker = (kind: PickerKind) => {
    closeMenu();
    setActivePicker(kind);
  };

  /** 以坐标为锚点打开主菜单（右键与触屏长按共用）。 */
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
    openMenuAt(e.clientX, e.clientY);
  };

  // 触屏长按（约 500ms 按住不动）与右键走同一菜单；触发后的抬手
  // click 由 hook 在 capture 阶段抑制，不会误触发行展开。
  const longPress = useLongPress((p) => openMenuAt(p.x, p.y));

  // Auto-focus first menu item when opened.
  React.useEffect(() => {
    if (menuOpen) {
      const id = requestAnimationFrame(() => firstItemRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [menuOpen]);

  return (
    <div ref={containerRef} className="flex flex-col" onContextMenu={onContextMenu} {...longPress}>
      {children}

      {/* Main context menu (anchored to the right-click coordinates). */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent
          align="start"
          className="w-44 p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuRow
            ref={firstItemRef}
            icon={completed ? Circle : Check}
            onClick={handleToggleComplete}
          >
            {completed ? t('markIncomplete') : t('markComplete')}
          </MenuRow>
          <MenuRow icon={CircleSlash} onClick={handleToggleCancel}>
            {cancelled ? t('markUncancelled') : t('markCancelled')}
          </MenuRow>
          <div className="-mx-1 my-1 h-px bg-muted" />
          <MenuRow icon={CalendarClock} onClick={() => openPicker('scheduled')}>
            {t('scheduledDate')}
          </MenuRow>
          <MenuRow icon={CalendarDays} onClick={() => openPicker('due')}>
            {t('dueDate')}
          </MenuRow>
          <MenuRow icon={Tag} onClick={() => openPicker('tags')}>
            {t('tags')}
          </MenuRow>
          {variant === 'default' && (
            <>
              <div className="-mx-1 my-1 h-px bg-muted" />
              <MenuRow icon={FolderInput} onClick={handleConvertToProject}>
                {t('convertToProject')}
              </MenuRow>
            </>
          )}
          <div className="-mx-1 my-1 h-px bg-muted" />
          <MenuRow
            icon={variant === 'trash' ? RotateCcw : Trash2}
            destructive
            onClick={variant === 'trash' ? handleRestore : handleDelete}
          >
            {variant === 'trash' ? tc('restore') : tc('delete')}
          </MenuRow>
        </PopoverContent>
      </Popover>

      {/* Picker popover (anchored to the row container). */}
      <Popover
        open={activePicker !== null}
        onOpenChange={(o) => !o && setActivePicker(null)}
      >
        <PopoverAnchor virtualRef={containerRef} />
        <PopoverContent align="start" onClick={(e) => e.stopPropagation()}>
          {activePicker === 'scheduled' && (
            <ScheduledDateField
              current={current}
              onPatch={patch}
              onClose={() => setActivePicker(null)}
              showReminder={getClientKind() !== 'web'}
              showRepeatRule
            />
          )}
          {activePicker === 'due' && (
            <DueDateField
              current={current}
              onPatch={patch}
              onClose={() => setActivePicker(null)}
            />
          )}
          {activePicker === 'tags' && (
            <TagsField current={current} onPatch={patch} />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

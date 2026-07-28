import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  taskKeys,
  useCompleteTask,
  useDeleteTask,
  useUncompleteTask,
  useUpdateTask,
} from '@/lib/hooks/useTasks';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { TagsField } from './fields/TagsField';

interface Props {
  task: TaskResponseDto;
  current: TaskResponseDto;
  children: React.ReactNode;
}

type PickerKind = 'scheduled' | 'due' | 'tags' | null;

const MENU_ITEM_CLASS =
  'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent';

export function TaskContextMenu({ task, current, children }: Props) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();

  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const firstItemRef = React.useRef<HTMLButtonElement>(null);
  const virtualAnchorRef = React.useRef<
    { getBoundingClientRect: () => ClientRect } | null
  >(null);

  const completed = current.status === 'COMPLETED';

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

  const handleDelete = () => {
    closeMenu();
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      },
      onError: () => toast.error(t('deleteFailed')),
    });
  };

  const openPicker = (kind: PickerKind) => {
    closeMenu();
    setActivePicker(kind);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
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

      {/* Main context menu (anchored to the right-click coordinates). */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent
          align="start"
          className="w-44 p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            ref={firstItemRef}
            type="button"
            onClick={handleToggleComplete}
            className={MENU_ITEM_CLASS}
          >
            {completed ? t('markIncomplete') : t('markComplete')}
          </button>
          <button
            type="button"
            onClick={() => openPicker('scheduled')}
            className={MENU_ITEM_CLASS}
          >
            {t('scheduledDate')}
          </button>
          <button
            type="button"
            onClick={() => openPicker('due')}
            className={MENU_ITEM_CLASS}
          >
            {t('dueDate')}
          </button>
          <button
            type="button"
            onClick={() => openPicker('tags')}
            className={MENU_ITEM_CLASS}
          >
            {t('tags')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className={cn(MENU_ITEM_CLASS, 'text-destructive')}
          >
            {tc('delete')}
          </button>
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
            <ScheduledDateField current={current} onPatch={patch} />
          )}
          {activePicker === 'due' && (
            <DueDateField current={current} onPatch={patch} />
          )}
          {activePicker === 'tags' && (
            <TagsField current={current} onPatch={patch} />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

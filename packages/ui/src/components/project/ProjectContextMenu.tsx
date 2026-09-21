import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoreHorizontal, Check, Circle, CalendarClock, CalendarDays, Tag, Trash2, RotateCcw } from 'lucide-react';

import type { ProjectResponseDto, UpdateProjectDto } from '@taskora/shared';

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { MenuRow } from '@/components/common/MenuRow';
import { useLongPress } from '../../lib/useLongPress';
import {
  projectKeys,
  useCompleteProject,
  useDeleteProject,
  useRestoreProject,
  useUncompleteProject,
  useUpdateProject,
} from '@taskora/api';
import { ScheduledDateField } from '@/components/task/fields/ScheduledDateField';
import { DueDateField } from '@/components/task/fields/DueDateField';
import { TagsField } from '@/components/task/fields/TagsField';

export interface ProjectMenuProps {
  project: ProjectResponseDto;
  current: ProjectResponseDto;
  variant?: 'default' | 'trash';
  onDeleted?: () => void;
}

type PickerKind = 'scheduled' | 'due' | 'tags' | null;

export function ProjectMenuPanel({
  project,
  current,
  variant = 'default',
  onDeleted,
  onClose,
  openPicker,
  firstItemRef,
}: ProjectMenuProps & {
  onClose: () => void;
  openPicker: (kind: Exclude<PickerKind, null>) => void;
  firstItemRef?: React.RefObject<HTMLButtonElement>;
}) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();

  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();
  const deleteProject = useDeleteProject();
  const restoreProject = useRestoreProject();

  const completed = current.status === 'COMPLETED';

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) });
    void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  const handleToggleComplete = () => {
    onClose();
    (completed ? uncompleteProject : completeProject).mutate(project.id, {
      onSuccess: invalidate,
      onError: () => toast.error(tc('saveFailed')),
    });
  };

  const handleDelete = () => {
    onClose();
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: projectKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['feed'] });
        onDeleted?.();
      },
      onError: () => toast.error(tc('deleteFailed')),
    });
  };

  const handleRestore = () => {
    onClose();
    restoreProject.mutate(project.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: projectKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['feed'] });
      },
      onError: () => toast.error(tc('restoreFailed')),
    });
  };

  return (
    <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
      <MenuRow
        ref={firstItemRef}
        icon={completed ? Circle : Check}
        onClick={handleToggleComplete}
      >
        {completed ? t('markIncomplete') : t('markComplete')}
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
      <div className="-mx-1 my-1 h-px bg-muted" />
      <MenuRow
        icon={variant === 'trash' ? RotateCcw : Trash2}
        destructive
        onClick={variant === 'trash' ? handleRestore : handleDelete}
      >
        {variant === 'trash' ? tc('restore') : tc('delete')}
      </MenuRow>
    </div>
  );
}

function useProjectPatch(project: ProjectResponseDto) {
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const updateProject = useUpdateProject();

  return (data: UpdateProjectDto) =>
    updateProject.mutate(
      { id: project.id, data },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) });
          void queryClient.invalidateQueries({ queryKey: projectKeys.all });
          void queryClient.invalidateQueries({ queryKey: ['feed'] });
        },
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
  if (kind === 'scheduled') {
    return <ScheduledDateField current={current} onPatch={patch} onClose={onClose} />;
  }
  if (kind === 'due') {
    return <DueDateField current={current} onPatch={patch} onClose={onClose} />;
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

  const closeMenu = () => setMenuOpen(false);

  const openPicker = (kind: Exclude<PickerKind, null>) => {
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
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY);
  };

  // 触屏长按与右键走同一菜单；触发后的抬手 click 被 hook 抑制。
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
    </div>
  );
}

/** Trigger 版：内置 MoreHorizontal 按钮，点击打开菜单 + picker。 */
export function ProjectMoreMenu({ project, current, variant = 'default' }: ProjectMenuProps) {
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const onDeleted = () => navigate('/today');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const patch = useProjectPatch(project);

  const closeMenu = () => setMenuOpen(false);

  const openPicker = (kind: Exclude<PickerKind, null>) => {
    closeMenu();
    setActivePicker(kind);
  };

  return (
    <div ref={containerRef}>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label={tc('more')}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-44 p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <ProjectMenuPanel
            project={project}
            current={current}
            variant={variant}
            onDeleted={onDeleted}
            onClose={closeMenu}
            openPicker={openPicker}
          />
        </PopoverContent>
      </Popover>

      <Popover
        open={activePicker !== null}
        onOpenChange={(o) => !o && setActivePicker(null)}
      >
        <PopoverAnchor virtualRef={containerRef} />
        <PopoverContent align="end" onClick={(e) => e.stopPropagation()}>
          {activePicker !== null && (
            <PickerContent kind={activePicker} current={current} patch={patch} onClose={() => setActivePicker(null)} />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
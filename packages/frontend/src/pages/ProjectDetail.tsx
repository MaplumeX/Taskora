import * as React from 'react';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Clock,
  Tag,
} from 'lucide-react';

import type { UpdateProjectDto } from '@taskora/shared';

import { useProjectsQuery, useUpdateProject } from '@/lib/hooks/useProjects';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
import { TaskListView } from '@/components/task/TaskListView';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';
import { InlineTitleEdit } from '@/components/common/InlineTitleEdit';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ScheduledDateField } from '@/components/task/fields/ScheduledDateField';
import { DueDateField } from '@/components/task/fields/DueDateField';
import { TagsField } from '@/components/task/fields/TagsField';

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const pendingAutoEditId = useUiInteractionStore((s) => s.pendingAutoEditId);
  const clearPendingAutoEditId = useUiInteractionStore((s) => s.clearPendingAutoEditId);
  const autoEdit = pendingAutoEditId === id;
  useEffect(() => {
    if (autoEdit) clearPendingAutoEditId();
  }, [autoEdit, clearPendingAutoEditId]);
  const { data: projects = [] } = useProjectsQuery();
  const project = projects.find((p) => p.id === id);
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ projectId: id });
  const showSkeleton = useDelayedLoading(isLoading);
  const updateProject = useUpdateProject();

  const patch = (data: UpdateProjectDto) =>
    updateProject.mutate(
      { id: id!, data },
      {
        onError: () => toast.error(t('common:saveFailed')),
      },
    );

  // Adapt field components which expect TaskResponseDto — project is compatible
  // for the fields they use (scheduledType, scheduledDate, dueDate, tags).
  const fieldCurrent = project as unknown as Parameters<typeof ScheduledDateField>[0]['current'];
  // Field components are typed for UpdateTaskDto, but the fields they emit
  // (scheduledType, scheduledDate, dueDate, tagIds) are identical for Project.
  // Cast to the expected onPatch signature to bridge the enum type gap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fieldPatch = patch as any;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          {project ? (
            <InlineTitleEdit
              value={project.title}
              placeholder={t('project:newItemPlaceholder')}
              autoFocusAndSelect={autoEdit}
              onSubmit={(next) => {
                if (!project) return;
                updateProject.mutate(
                  { id: project.id, data: { title: next } },
                  {
                    onError: () => toast.error(t('common:saveFailed')),
                  },
                );
              }}
            />
          ) : (
            <h1 className="text-xl font-semibold tracking-tight">{t('project:defaultTitle')}</h1>
          )}
        </div>
      </div>

      {/* Field editing row */}
      {project && (
        <div className="flex items-center gap-1">
          <IconPopover
            label={t('task:scheduledDate')}
            icon={<Calendar className="h-4 w-4" />}
            active={project.scheduledType !== 'NONE'}
          >
            <ScheduledDateField current={fieldCurrent} onPatch={fieldPatch} />
          </IconPopover>

          <IconPopover
            label={t('task:dueDate')}
            icon={<Clock className="h-4 w-4" />}
            active={!!project.dueDate}
          >
            <DueDateField current={fieldCurrent} onPatch={fieldPatch} />
          </IconPopover>

          <IconPopover
            label={t('task:tags')}
            icon={<Tag className="h-4 w-4" />}
            active={(project.tags ?? []).length > 0}
          >
            <TagsField current={fieldCurrent} onPatch={fieldPatch} />
          </IconPopover>
        </div>
      )}

      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint={t('project:noTasks')} />
      )}
    </div>
  );
}

function IconPopover({
  label,
  icon,
  active,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', active ? 'text-primary' : 'text-muted-foreground')}
          aria-label={label}
        >
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">{children}</PopoverContent>
    </Popover>
  );
}
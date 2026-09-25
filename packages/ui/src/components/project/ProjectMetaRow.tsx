import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Calendar, Flag } from 'lucide-react';

import { ScheduledType } from '@taskora/shared';
import type { ProjectResponseDto, UpdateProjectDto } from '@taskora/shared';
import {
  formatDateLabel,
  formatDeadlineCountdown,
  isOverdue,
  isToday,
  projectKeys,
  useUpdateProject,
} from '@taskora/api';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScheduledDateField } from '@/components/task/fields/ScheduledDateField';
import { DueDateField } from '@/components/task/fields/DueDateField';
import { TagsField } from '@/components/task/fields/TagsField';
import { cn } from '@/lib/utils';

interface Props {
  project: ProjectResponseDto;
}

/**
 * 项目详情头部的元数据行：计划日期 / 截止日期 / 标签。
 * 展示风格与任务条目的徽章一致（图标 + 小字，过期/今天为警示色），
 * 点击徽章打开 Popover 编辑，复用任务侧的字段组件。
 */
export function ProjectMetaRow({ project }: Props) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const updateProject = useUpdateProject();

  const patch = (data: UpdateProjectDto) =>
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

  const scheduledType = project.scheduledType ?? ScheduledType.NONE;
  const tags = project.tags ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {scheduledType !== ScheduledType.NONE ? (
        <MetaPopover
          label={t('scheduledDate')}
          trigger={
            <MetaBadge
              icon={<Calendar className="h-3 w-3" />}
              text={
                scheduledType === ScheduledType.SOMEDAY
                  ? t('somedayLabel')
                  : project.scheduledDate
                    ? formatDateLabel(new Date(project.scheduledDate))
                    : null
              }
            />
          }
        >
          {(close) => <ScheduledDateField current={project} onPatch={patch} onClose={close} />}
        </MetaPopover>
      ) : null}

      {project.dueDate ? (
        <MetaPopover
          label={t('dueDate')}
          trigger={
            <MetaBadge
              icon={<Flag className="h-3 w-3" />}
              text={formatDeadlineCountdown(new Date(project.dueDate))}
              urgent={isDeadlineUrgent(project.dueDate)}
            />
          }
        >
          {(close) => <DueDateField current={project} onPatch={patch} onClose={close} />}
        </MetaPopover>
      ) : null}

      {tags.length > 0 ? (
        <MetaPopover
          label={t('tags')}
          trigger={
            <span className="inline-flex items-center gap-1">
              {tags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  title={tag.title}
                />
              ))}
            </span>
          }
        >
          <TagsField current={project} onPatch={patch} />
        </MetaPopover>
      ) : null}
    </div>
  );
}

/**
 * Deadline 警示色：到期/逾期变红（参考 Things 3，红色只属于 Deadline）。
 * 计划日期（When）永不逾期，不套警示色。
 */
function isDeadlineUrgent(dateIso: string | null | undefined): boolean {
  if (!dateIso) return false;
  const date = new Date(dateIso);
  return isOverdue(date) || isToday(date);
}

/** 徽章式触发器：风格对齐 TaskDateBadge / TaskDueDateBadge（图标 + xs 文字）。 */
function MetaBadge({
  icon,
  text,
  urgent = false,
}: {
  icon: React.ReactNode;
  text: string | null;
  urgent?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        urgent ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {icon}
      {text}
    </span>
  );
}

/**
 * 可点击的元数据徽章：trigger 内渲染徽章内容（无值时退化为图标按钮），
 * Popover 内容复用任务字段组件。
 */
function MetaPopover({
  label,
  children,
  trigger,
}: {
  label: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:h-9"
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        {typeof children === 'function' ? children(() => setOpen(false)) : children}
      </PopoverContent>
    </Popover>
  );
}

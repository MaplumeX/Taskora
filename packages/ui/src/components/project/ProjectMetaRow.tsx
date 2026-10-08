import { useCalendarDay, parseCalendarDate } from '@taskora/api';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Calendar, Flag, Repeat } from 'lucide-react';

import { ScheduledType } from '@taskora/shared';
import type { ProjectResponseDto, UpdateProjectDto } from '@taskora/shared';
import {
  formatDateLabel,
  formatDeadlineCountdown,
  isOverdue,
  isToday,
  projectTakesPartInReview,
  useUpdateProject,
} from '@taskora/api';

import { MetaBadge, MetaPopover, MetaTagDots } from '@/components/common/MetaBadge';
import { ReviewMetaBadge } from '@/components/review/ReviewSchedule';
import { ScheduledDateField } from '@/components/task/fields/ScheduledDateField';
import { DueDateField } from '@/components/task/fields/DueDateField';
import { RepeatRuleField } from '@/components/task/fields/RepeatRuleField';
import { TagsField } from '@/components/task/fields/TagsField';

interface Props {
  project: ProjectResponseDto;
}

/**
 * 项目详情头部的元数据行：计划日期 / 重复 / 截止日期 / 标签 / 下次回顾日。
 * 展示风格与任务条目的徽章一致（图标 + 小字，过期/今天为警示色），
 * 点击徽章打开字段选择器编辑，复用任务侧的字段组件。
 */
export function ProjectMetaRow({ project }: Props) {
  useCalendarDay();
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const updateProject = useUpdateProject();

  const patch = (data: UpdateProjectDto) =>
    updateProject.mutate(
      { id: project.id, data },
      {
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
                    ? formatDateLabel(parseCalendarDate(project.scheduledDate))
                    : null
              }
            />
          }
        >
          {(close) => <ScheduledDateField current={project} onPatch={patch} onClose={close} />}
        </MetaPopover>
      ) : null}

      {project.repeatRule ? (
        <MetaPopover
          label={t('repeat')}
          trigger={<MetaBadge icon={<Repeat className="h-3 w-3" />} text={t('repeat')} />}
        >
          {() => <RepeatRuleField current={project} onPatch={patch} />}
        </MetaPopover>
      ) : null}

      {project.dueDate ? (
        <MetaPopover
          label={t('dueDate')}
          trigger={
            <MetaBadge
              icon={<Flag className="h-3 w-3" />}
              text={formatDeadlineCountdown(parseCalendarDate(project.dueDate))}
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
          trigger={<MetaTagDots tags={tags} />}
        >
          <TagsField current={project} onPatch={patch} />
        </MetaPopover>
      ) : null}

      {projectTakesPartInReview(project) ? (
        <ReviewMetaBadge target={{ kind: 'project', ...project }} />
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
  const date = parseCalendarDate(dateIso);
  return isOverdue(date) || isToday(date);
}

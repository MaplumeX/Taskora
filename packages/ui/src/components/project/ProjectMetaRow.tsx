import { useCalendarDay, parseCalendarDate } from '@taskora/api';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarDays, CloudSun, Flag, Repeat, Star } from 'lucide-react';

import { ScheduledType } from '@taskora/shared';
import type { ProjectResponseDto, UpdateProjectDto } from '@taskora/shared';
import {
  formatDateLabel,
  formatDeadlineCountdown,
  isOverdue,
  isToday,
  projectTakesPartInReview,
  startOfTomorrow,
  usePreferencesStore,
  useUpdateProject,
} from '@taskora/api';

import { MetaBadge, MetaDivider, MetaPopover, MetaRowLayout, MetaTagPills } from '@/components/common/MetaBadge';
import { ReviewMetaBadge } from '@/components/review/ReviewSchedule';
import { ScheduledDateField } from '@/components/task/fields/ScheduledDateField';
import { DueDateField } from '@/components/task/fields/DueDateField';
import { RepeatRuleField } from '@/components/task/fields/RepeatRuleField';
import { TagsField } from '@/components/task/fields/TagsField';
import { formatRepeatSummary } from '@/components/task/fields/repeatSummary';

interface Props {
  project: ProjectResponseDto;
}

/**
 * 项目详情头部的元数据行（Things 3 式，标题下方、与备注左对齐）：
 * 左槽 标签胶囊 / 计划日期 / 重复规则摘要，右槽 截止日期 | 下次回顾日（细线分隔）。
 * 计划日期 ≤ 今天显示黄星「今天」（When 永不逾期）；未来日期 / 某天用侧边栏
 * 计划 / 某天入口的图标与颜色。
 * 点击徽章打开字段选择器编辑，复用任务侧的字段组件。
 */
export function ProjectMetaRow({ project }: Props) {
  useCalendarDay();
  const { t } = useTranslation('task');
  const { t: tc, i18n } = useTranslation('common');
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
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

  const scheduledDate = project.scheduledDate ? parseCalendarDate(project.scheduledDate) : null;
  const scheduledIsToday = scheduledDate != null && scheduledDate < startOfTomorrow();

  return (
    <MetaRowLayout
      start={
        <>
          {tags.length > 0 ? (
            <MetaPopover label={t('tags')} trigger={<MetaTagPills tags={tags} />}>
              <TagsField current={project} onPatch={patch} />
            </MetaPopover>
          ) : null}

          {scheduledType !== ScheduledType.NONE ? (
            <MetaPopover
              label={t('scheduledDate')}
              trigger={
                scheduledType === ScheduledType.SOMEDAY ? (
                  <MetaBadge
                    icon={<CloudSun className="h-3 w-3 text-nav-someday" />}
                    text={t('somedayLabel')}
                  />
                ) : scheduledIsToday ? (
                  <MetaBadge
                    icon={<Star className="h-3 w-3 fill-today text-today" />}
                    text={tc('today')}
                  />
                ) : (
                  <MetaBadge
                    icon={<CalendarDays className="h-3 w-3 text-nav-upcoming" />}
                    text={scheduledDate ? formatDateLabel(scheduledDate) : null}
                  />
                )
              }
            >
              {(close) => <ScheduledDateField current={project} onPatch={patch} onClose={close} />}
            </MetaPopover>
          ) : null}

          {project.repeatRule ? (
            <MetaPopover
              label={t('repeat')}
              trigger={
                <MetaBadge
                  icon={<Repeat className="h-3 w-3" />}
                  text={formatRepeatSummary(project.repeatRule, {
                    t: tc,
                    language: i18n.language,
                    weekStartsOn,
                  })}
                />
              }
            >
              {() => <RepeatRuleField current={project} onPatch={patch} />}
            </MetaPopover>
          ) : null}
        </>
      }
      end={
        <>
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

          {projectTakesPartInReview(project) ? (
            <>
              {project.dueDate ? <MetaDivider /> : null}
              <ReviewMetaBadge target={{ kind: 'project', ...project }} />
            </>
          ) : null}
        </>
      }
    />
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

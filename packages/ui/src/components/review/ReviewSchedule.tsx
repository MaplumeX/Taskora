import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, History } from 'lucide-react';

import {
  formatDateLabel,
  formatShortDate,
  parseCalendarDate,
  todayDateKey,
  useCalendarDay,
  useMarkAreaReviewed,
  useMarkProjectReviewed,
  usePreferencesStore,
  useUpdateArea,
  useUpdateProject,
} from '@taskora/api';
import type { ReviewInterval, ReviewQueueItem } from '@taskora/shared';

import { MenuRow } from '@/components/common/MenuRow';
import { MetaBadge, MetaPopover } from '@/components/common/MetaBadge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import {
  NextReviewDateEditor,
  ReviewIntervalEditor,
  useLastReviewedLabel,
} from './ReviewFields';

/** 回顾设置作用的对象：Project 或 Area 的回顾字段。 */
export interface ReviewTarget {
  kind: ReviewQueueItem['kind'];
  id: string;
  reviewInterval?: ReviewInterval | null;
  nextReviewDate?: string | null;
  lastReviewedOn?: string | null;
}

/**
 * 对象的回顾排期（只读）：间隔（存量或不合法数据为空时按该类型的账号默认）、
 * 下次回顾日（存量数据的空值视为今天）与上次回顾日。
 */
export function useReviewSchedule(target: ReviewTarget) {
  useCalendarDay();
  const defaultInterval = usePreferencesStore((s) => s.defaultReviewIntervals[target.kind]);
  return {
    interval: target.reviewInterval ?? defaultInterval,
    nextReviewDate: target.nextReviewDate ?? todayDateKey(),
    lastReviewedOn: target.lastReviewedOn ?? null,
  };
}

/** 回顾排期加上编辑与标记已回顾。 */
export function useReviewActions(target: ReviewTarget) {
  const { t: tc } = useTranslation('common');
  const schedule = useReviewSchedule(target);
  const updateProject = useUpdateProject();
  const updateArea = useUpdateArea();
  const markProject = useMarkProjectReviewed();
  const markArea = useMarkAreaReviewed();

  const onError = () => toast.error(tc('saveFailed'));
  const patch = (data: { reviewInterval?: ReviewInterval; nextReviewDate?: string }) => {
    if (target.kind === 'project') updateProject.mutate({ id: target.id, data }, { onError });
    else updateArea.mutate({ id: target.id, data }, { onError });
  };

  return {
    ...schedule,
    setInterval: (reviewInterval: ReviewInterval) => patch({ reviewInterval }),
    setNextReviewDate: (nextReviewDate: string) => patch({ nextReviewDate }),
    markReviewed: () => {
      if (target.kind === 'project') markProject.mutate(target.id, { onError });
      else markArea.mutate(target.id, { onError });
    },
  };
}

/** 「…」菜单的回顾一行：点开回顾选择器。 */
export function ReviewMenuRow({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('review');
  return (
    <MenuRow icon={CalendarCheck} onClick={onClick}>
      {t('title')}
    </MenuRow>
  );
}

/**
 * Project / Area 页头元数据行里的下次回顾日徽章，点开回顾选择器。
 * 下次回顾日不逾期，到期也不套警示色。
 */
export function ReviewMetaBadge({ target }: { target: ReviewTarget }) {
  const { t } = useTranslation('review');
  const schedule = useReviewSchedule(target);
  return (
    <MetaPopover
      label={t('nextReview')}
      trigger={
        <MetaBadge
          icon={<CalendarCheck className="h-3 w-3" />}
          text={formatDateLabel(parseCalendarDate(schedule.nextReviewDate))}
        />
      }
    >
      <ReviewPicker target={target} />
    </MetaPopover>
  );
}

/**
 * 回顾栏上的「回顾设置」按钮：点开与「…」菜单里同一个回顾选择器（间隔、
 * 下次回顾日、上次回顾日）。
 */
export function ReviewSettingsButton({
  target,
  className,
}: {
  target: ReviewTarget;
  className?: string;
}) {
  const { t } = useTranslation('review');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-7 gap-1.5 px-2 text-meta', className)}>
          <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
          {t('settings')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <ReviewPicker target={target} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * 「…」菜单里的回顾选择器（与重复、截止日期同一种弹层）：回顾间隔、下次
 * 回顾日与只读的上次回顾日。不提供标记已回顾——那只在 Review 里进行。
 */
export function ReviewPicker({ target }: { target: ReviewTarget }) {
  const { t } = useTranslation('review');
  const lastReviewedLabel = useLastReviewedLabel();
  const actions = useReviewActions(target);
  return (
    <div className="flex flex-col gap-2">
      <section className="flex flex-col gap-1">
        <h3 className="px-2 text-meta font-medium text-muted-foreground">{t('interval')}</h3>
        <ReviewIntervalEditor value={actions.interval} onChange={actions.setInterval} />
      </section>
      <div className="-mx-1 h-px bg-muted" />
      <section className="flex flex-col gap-1">
        <h3 className="flex items-baseline justify-between gap-2 px-2 text-meta font-medium text-muted-foreground">
          {t('nextReview')}
          <span className="text-foreground">
            {formatShortDate(parseCalendarDate(actions.nextReviewDate))}
          </span>
        </h3>
        <NextReviewDateEditor value={actions.nextReviewDate} onChange={actions.setNextReviewDate} />
      </section>
      <div className="-mx-1 h-px bg-muted" />
      <p className="flex items-center gap-1.5 px-2 pb-1 text-meta text-muted-foreground">
        <History aria-hidden className="h-3.5 w-3.5" />
        {t('lastReviewed', { when: lastReviewedLabel(actions.lastReviewedOn) })}
      </p>
    </div>
  );
}

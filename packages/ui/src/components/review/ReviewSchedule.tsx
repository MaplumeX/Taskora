import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, Repeat } from 'lucide-react';

import {
  formatShortDate,
  parseCalendarDate,
  todayDateKey,
  useMarkAreaReviewed,
  useMarkProjectReviewed,
  usePreferencesStore,
  useUpdateArea,
  useUpdateProject,
} from '@taskora/api';
import type { ReviewInterval, ReviewQueueItem } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import {
  NextReviewDateCalendar,
  ReviewIntervalEditor,
  useReviewIntervalLabel,
} from './ReviewFields';

/** 回顾设置作用的对象：Project 或 Area 的回顾字段。 */
export interface ReviewTarget {
  kind: ReviewQueueItem['kind'];
  id: string;
  reviewInterval?: ReviewInterval | null;
  nextReviewDate?: string | null;
}

/**
 * 对象的回顾操作：生效值（存量数据的空字段按默认间隔 / 今天）、编辑与
 * 标记已回顾。
 */
export function useReviewActions(target: ReviewTarget) {
  const { t: tc } = useTranslation('common');
  const defaultInterval = usePreferencesStore((s) => s.defaultReviewInterval);
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
    interval: target.reviewInterval ?? defaultInterval,
    nextReviewDate: target.nextReviewDate ?? todayDateKey(),
    setInterval: (reviewInterval: ReviewInterval) => patch({ reviewInterval }),
    setNextReviewDate: (nextReviewDate: string) => patch({ nextReviewDate }),
    markReviewed: () => {
      if (target.kind === 'project') markProject.mutate(target.id, { onError });
      else markArea.mutate(target.id, { onError });
    },
  };
}

/** 间隔与下次回顾日两个可编辑的芯片（回顾栏与回顾设置对话框共用）。 */
export function ReviewScheduleChips({
  target,
  className,
}: {
  target: ReviewTarget;
  className?: string;
}) {
  const { t } = useTranslation('review');
  const intervalLabel = useReviewIntervalLabel();
  const actions = useReviewActions(target);
  const [open, setOpen] = useState<'interval' | 'date' | null>(null);
  const toggle = (kind: 'interval' | 'date') => (next: boolean) => setOpen(next ? kind : null);

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Popover open={open === 'interval'} onOpenChange={toggle('interval')}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-meta">
            <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="sr-only">{t('interval')}</span>
            {intervalLabel(actions.interval)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          <ReviewIntervalEditor value={actions.interval} onChange={actions.setInterval} />
        </PopoverContent>
      </Popover>
      <Popover open={open === 'date'} onOpenChange={toggle('date')}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-meta">
            <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
            {t('nextReview')} {formatShortDate(parseCalendarDate(actions.nextReviewDate))}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <NextReviewDateCalendar
            value={actions.nextReviewDate}
            onChange={(next) => {
              actions.setNextReviewDate(next);
              setOpen(null);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

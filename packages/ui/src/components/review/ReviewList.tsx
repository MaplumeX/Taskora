import { useMemo, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, Layers } from 'lucide-react';

import {
  formatDateLabel,
  parseCalendarDate,
  useMarkAreaReviewed,
  useMarkProjectReviewed,
} from '@taskora/api';
import type {
  AreaResponseDto,
  ProjectResponseDto,
  ReviewQueue,
  ReviewQueueItem,
} from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { ProjectFeedRow } from '@/components/feed/ProjectFeedRow';
import { reviewNav } from '@/components/layout/navItems';
import { cn } from '@/lib/utils';

import { useLastReviewedLabel } from './ReviewFields';

interface Props {
  queue: ReviewQueue;
  projects: readonly ProjectResponseDto[];
  areas: readonly AreaResponseDto[];
  /** 从某个对象开始一轮回顾。 */
  onOpen: (item: ReviewQueueItem) => void;
}

/**
 * 回顾列表（Review List）：只列待回顾的 Project 与 Area（回顾队列的顺序），
 * 每行带上次回顾日；没到期的对象不出现，下一次回顾日只在列表为空时提示。
 * 点任一行从它开始一轮回顾。
 */
export function ReviewList({ queue, projects, areas, onOpen }: Props) {
  const { t } = useTranslation('review');
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const lastReviewedLabel = useLastReviewedLabel();

  if (queue.items.length === 0) {
    const Icon = reviewNav.icon;
    return (
      <div className="mt-16 flex flex-col items-center gap-3 py-12 text-center">
        <Icon aria-hidden className="h-12 w-12 text-muted-foreground/35" strokeWidth={1.25} />
        <p className="text-body text-muted-foreground">{t('emptyTitle')}</p>
        <UpcomingHint queue={queue} />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {queue.items.map((item) => {
        const open = () => onOpen(item);
        const row = item.kind === 'project' ? projectById.get(item.id) : areaById.get(item.id);
        const trailing = (
          <>
            <span className="whitespace-nowrap text-meta text-muted-foreground">
              {t('lastReviewed', { when: lastReviewedLabel(row?.lastReviewedOn) })}
            </span>
            <MarkReviewedButton item={item} />
          </>
        );
        if (item.kind === 'project') {
          const project = projectById.get(item.id);
          return project ? (
            <ProjectFeedRow key={item.id} item={project} onOpen={open} trailing={trailing} />
          ) : null;
        }
        const area = areaById.get(item.id);
        return area ? (
          <ReviewAreaRow key={item.id} area={area} onOpen={open} trailing={trailing} />
        ) : null;
      })}
    </div>
  );
}

/** 空状态里的下一次回顾日与当天的数量。 */
function UpcomingHint({ queue }: { queue: ReviewQueue }) {
  const { t } = useTranslation('review');
  return (
    <p className="text-meta text-muted-foreground">
      {queue.upcoming
        ? t('upcoming', {
            date: formatDateLabel(parseCalendarDate(queue.upcoming.date)),
            count: queue.upcoming.count,
          })
        : t('noUpcoming')}
    </p>
  );
}

/** 区域行：与项目行同高同字重，行首为区域图标。 */
function ReviewAreaRow({
  area,
  onOpen,
  trailing,
}: {
  area: AreaResponseDto;
  onOpen: () => void;
  trailing: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="button"
      tabIndex={0}
      className="group relative flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40 max-md:h-11"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onOpen();
      }}
    >
      <Layers aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span
        className={cn(
          'flex-1 truncate text-left text-body font-semibold',
          area.title ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {area.title || t('area:newItemPlaceholder')}
      </span>
      <div className="flex items-center gap-2">{trailing}</div>
    </div>
  );
}

/** 悬停时出现的「标记已回顾」：不进入回顾模式也能直接标记。 */
function MarkReviewedButton({ item }: { item: ReviewQueueItem }) {
  const { t } = useTranslation('review');
  const markProject = useMarkProjectReviewed();
  const markArea = useMarkAreaReviewed();

  const mark = (e: MouseEvent) => {
    e.stopPropagation();
    const onError = () => toast.error(t('common:saveFailed'));
    if (item.kind === 'project') markProject.mutate(item.id, { onError });
    else markArea.mutate(item.id, { onError });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('markReviewed')}
      title={t('markReviewed')}
      className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100 max-md:hidden"
      onClick={mark}
    >
      <CalendarCheck className="h-3.5 w-3.5" />
    </Button>
  );
}

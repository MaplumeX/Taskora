import { useTranslation } from 'react-i18next';
import { Check, Circle, Layers } from 'lucide-react';

import type { AreaResponseDto, ProjectResponseDto, ReviewQueueItem } from '@taskora/shared';

import { cn } from '@/lib/utils';

import { reviewItemGone, type ReviewItemStatus, type ReviewSession } from './reviewSession';

const STATUS_ICON: Record<ReviewItemStatus, typeof Check> = {
  processed: Check,
  pending: Circle,
};

interface Props {
  session: ReviewSession;
  projects: readonly ProjectResponseDto[] | undefined;
  areas: readonly AreaResponseDto[] | undefined;
  /** 选中一项之后（关闭弹层）。 */
  onPicked?: () => void;
}

/**
 * 本轮回顾的队列：快照里的每个对象及其在本轮是否已处理，当前对象整行
 * 高亮。点一项直接跳过去；已了结或删除的对象算已处理，不可点。桌面端在
 * 回顾栏进度的弹层里，手机端在左侧抽屉里。
 */
export function ReviewQueueList({ session, projects, areas, onPicked }: Props) {
  const { t } = useTranslation();
  const titleOf = (item: ReviewQueueItem) => {
    const row =
      item.kind === 'project'
        ? projects?.find((p) => p.id === item.id)
        : areas?.find((a) => a.id === item.id);
    return (
      row?.title ||
      t(item.kind === 'project' ? 'project:newItemPlaceholder' : 'area:newItemPlaceholder')
    );
  };

  return (
    <ul className="flex flex-col py-1">
      {session.snapshot?.map((item, index) => {
        const status = session.statusOf(item);
        const StatusIcon = STATUS_ICON[status];
        const isCurrent = index === session.index;
        return (
          <li key={`${item.kind}:${item.id}`}>
            <button
              type="button"
              disabled={reviewItemGone(item, projects, areas)}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body hover:bg-accent/60 disabled:pointer-events-none max-md:h-11',
                isCurrent && 'bg-selection hover:bg-selection',
              )}
              onClick={() => {
                session.jump(item);
                onPicked?.();
              }}
            >
              <StatusIcon
                aria-label={t(`review:status_${status}`)}
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  status === 'pending' ? 'text-muted-foreground' : 'text-primary',
                )}
              />
              {item.kind === 'area' && (
                <Layers aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  'flex-1 truncate',
                  status === 'processed' && !isCurrent
                    ? 'text-muted-foreground'
                    : 'text-foreground',
                )}
              >
                {titleOf(item)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

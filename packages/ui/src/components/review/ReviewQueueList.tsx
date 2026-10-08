import { useTranslation } from 'react-i18next';
import { Check, Circle, CircleDot, Layers, SkipForward, X } from 'lucide-react';

import type { AreaResponseDto, ProjectResponseDto, ReviewQueueItem } from '@taskora/shared';

import { cn } from '@/lib/utils';

import type { ReviewItemStatus, ReviewSession } from './reviewSession';

const STATUS_ICON: Record<ReviewItemStatus, typeof Check> = {
  current: CircleDot,
  reviewed: Check,
  skipped: SkipForward,
  gone: X,
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
 * 本轮回顾的队列：快照里的每个对象及其在本轮的状态（当前 / 已回顾 /
 * 跳过 / 已了结或删除 / 未到）。点一项直接跳过去。桌面端在回顾栏进度的
 * 弹层里，手机端在左侧抽屉里。
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
      {session.snapshot?.map((item) => {
        const status = session.statusOf(item);
        const StatusIcon = STATUS_ICON[status];
        const muted = status === 'reviewed' || status === 'gone';
        return (
          <li key={`${item.kind}:${item.id}`}>
            <button
              type="button"
              disabled={status === 'gone'}
              aria-current={status === 'current' ? 'step' : undefined}
              className={cn(
                'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body hover:bg-accent/60 disabled:pointer-events-none max-md:h-11',
                status === 'current' && 'bg-selection hover:bg-selection',
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
                  status === 'current' || status === 'reviewed'
                    ? 'text-primary'
                    : 'text-muted-foreground',
                )}
              />
              {item.kind === 'area' && (
                <Layers aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  'flex-1 truncate',
                  muted ? 'text-muted-foreground' : 'text-foreground',
                  status === 'gone' && 'line-through',
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

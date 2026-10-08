import { useCallback, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, ChevronLeft, LogOut, SkipForward } from 'lucide-react';

import {
  formatDateLabel,
  parseCalendarDate,
  useAreasQuery,
  useMarkAreaReviewed,
  useMarkProjectReviewed,
  useProjectsQuery,
  useReviewQueueQuery,
} from '@taskora/api';
import type { ReviewQueue, ReviewQueueItem } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { reviewNav } from '@/components/layout/navItems';
import { ReviewScheduleChips, type ReviewTarget } from '@/components/review/ReviewSchedule';
import { ReviewModeContext } from '@/components/review/reviewMode';
import { registerReviewCommands } from '@/components/review/reviewCommands';
import {
  parseReviewPath,
  reviewPath,
  useReviewSession,
  type ReviewSession,
} from '@/components/review/reviewSession';
import { useIsDesktop } from '../lib/use-media-query';
import { cn } from '@/lib/utils';

import AreaDetail from './AreaDetail';
import ProjectDetail from './ProjectDetail';

/**
 * 回顾模式（Review Mode，见 CONTEXT.md）：进入即开始逐个回顾。每一步是
 * 当前 Project / Area 的完整可编辑页面，外面套一条回顾栏。
 */
export default function Review() {
  const { t } = useTranslation('review');
  const navigate = useNavigate();
  const rest = useParams()['*'] ?? '';
  const current = parseReviewPath(rest);
  const { data: queue } = useReviewQueueQuery();
  const { data: projects } = useProjectsQuery();
  const { data: areas } = useAreasQuery();
  const markProject = useMarkProjectReviewed();
  const markArea = useMarkAreaReviewed();

  // 步进替换历史记录：系统返回直接退出回顾模式
  const go = useCallback(
    (item: ReviewQueueItem | null) => navigate(reviewPath(item), { replace: true }),
    [navigate],
  );
  const { mutate: mutateProject } = markProject;
  const { mutate: mutateArea } = markArea;
  const markReviewed = useCallback(
    (item: ReviewQueueItem) => {
      const onError = () => toast.error(t('common:saveFailed'));
      if (item.kind === 'project') mutateProject(item.id, { onError });
      else mutateArea(item.id, { onError });
    },
    [mutateProject, mutateArea, t],
  );

  const session = useReviewSession({
    queueItems: queue?.items,
    projects,
    areas,
    current,
    go,
    markReviewed,
  });

  // 会话中再次点 Review 入口（回到 /review）：按当时的待回顾集合重建快照
  const { snapshot, restart } = session;
  useEffect(() => {
    if (rest === '' && snapshot) restart();
  }, [rest, snapshot, restart]);

  // 快捷键（KeyboardShortcuts）经命令通道转到最新的会话
  const latest = useRef(session);
  latest.current = session;
  useEffect(
    () =>
      registerReviewCommands((command) => {
        if (command === 'markNext') latest.current.markNext();
        else if (command === 'skip') latest.current.skip();
        else latest.current.previous();
      }),
    [],
  );

  // 进入时是否是历史的第一条（直接打开回顾）：步进都是替换，返回一步即
  // 回到进入回顾前的页面
  const { key: entryKey } = useLocation();
  const [openedDirectly] = useState(() => entryKey === 'default');
  const exit = () => {
    if (openedDirectly) navigate('/today', { replace: true });
    else navigate(-1);
  };

  if (!session.snapshot) return null;

  const target =
    session.index >= 0
      ? current?.kind === 'project'
        ? projects?.find((p) => p.id === current.id)
        : areas?.find((a) => a.id === current?.id)
      : undefined;

  return (
    <ReviewModeContext.Provider value>
      <div className="flex flex-col gap-4">
        <ReviewBar
          session={session}
          target={target && current ? { ...target, kind: current.kind } : null}
          onExit={exit}
        />
        <Routes>
          <Route path="project/:id" element={<ReviewStep kind="project" />} />
          <Route path="area/:id" element={<ReviewStep kind="area" />} />
          <Route
            path="*"
            element={
              <ReviewFinished
                empty={session.snapshot.length === 0}
                queue={queue}
                onRestart={session.restart}
              />
            }
          />
        </Routes>
      </div>
    </ReviewModeContext.Provider>
  );
}

/** 每一步复用现有的项目页 / 区域页；换对象时整页重建。 */
function ReviewStep({ kind }: { kind: ReviewQueueItem['kind'] }) {
  const { id } = useParams<{ id: string }>();
  return kind === 'project' ? <ProjectDetail key={id} /> : <AreaDetail key={id} />;
}

interface ReviewBarProps {
  session: ReviewSession;
  /** 当前对象（走完时为 null）。 */
  target: ReviewTarget | null;
  onExit: () => void;
}

/**
 * 回顾栏：进度、间隔与下次回顾日（可编辑）、标记已回顾 / 跳过 / 上一个 /
 * 退出。桌面端是页面顶部的一条；手机端顶部放进度与日期，底部工具栏放
 * 「上一个 / 跳过 / 标记已回顾」，系统返回退出。
 */
function ReviewBar({ session, target, onExit }: ReviewBarProps) {
  const { t } = useTranslation('review');
  const desktop = useIsDesktop();
  const total = session.snapshot?.length ?? 0;
  const inStep = session.index >= 0 && target !== null;
  const Icon = reviewNav.icon;

  const progress = (
    <span className="flex items-center gap-1.5 text-meta font-medium tabular-nums text-muted-foreground">
      <Icon className={cn('h-4 w-4', reviewNav.colorClass)} />
      {t('title')}
      {inStep && <span>{t('progress', { current: session.index + 1, total })}</span>}
    </span>
  );
  const chips = inStep ? <ReviewScheduleChips target={target} /> : null;

  const previousButton = (
    <Button
      variant="ghost"
      size={desktop ? 'sm' : 'default'}
      disabled={!session.canGoPrevious}
      onClick={session.previous}
    >
      <ChevronLeft />
      {t('previous')}
    </Button>
  );
  const skipButton = (
    <Button variant="ghost" size={desktop ? 'sm' : 'default'} onClick={session.skip}>
      <SkipForward />
      {t('skip')}
    </Button>
  );
  const markButton = (
    <Button size={desktop ? 'sm' : 'default'} onClick={session.markNext}>
      <CalendarCheck />
      {t('markReviewed')}
    </Button>
  );

  if (!desktop) {
    return (
      <>
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 px-3 py-2">
          {progress}
          {chips}
        </div>
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t bg-background px-3 pb-[calc(var(--safe-area-bottom)+0.5rem)] pt-2">
          {previousButton}
          {inStep && skipButton}
          {inStep && markButton}
        </div>
      </>
    );
  }

  return (
    <div className="sticky top-0 z-20 -mx-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 backdrop-blur">
      {progress}
      {chips}
      <div className="ml-auto flex items-center gap-1">
        <Hint label={t('previous')} action="reviewPrevious">
          {previousButton}
        </Hint>
        {inStep && (
          <Hint label={t('skip')} action="reviewSkip">
            {skipButton}
          </Hint>
        )}
        {inStep && (
          <Hint label={t('markReviewed')} action="reviewMarkNext">
            {markButton}
          </Hint>
        )}
        <Button variant="ghost" size="sm" onClick={onExit}>
          <LogOut />
          {t('exit')}
        </Button>
      </div>
    </div>
  );
}

/** 空状态：没有待回顾的对象，或走完了这一轮；显示下一次回顾日。 */
function ReviewFinished({
  empty,
  queue,
  onRestart,
}: {
  empty: boolean;
  queue: ReviewQueue | undefined;
  onRestart: () => void;
}) {
  const { t } = useTranslation('review');
  const Icon = reviewNav.icon;
  const stillDue = empty ? 0 : (queue?.items.length ?? 0);
  return (
    <div className="mt-16 flex flex-col items-center gap-3 py-12 text-center">
      <Icon aria-hidden className="h-12 w-12 text-muted-foreground/35" strokeWidth={1.25} />
      <p className="text-body font-medium">{empty ? t('emptyTitle') : t('doneTitle')}</p>
      <p className="text-meta text-muted-foreground">
        {queue?.upcoming
          ? t('upcoming', {
              date: formatDateLabel(parseCalendarDate(queue.upcoming.date)),
              count: queue.upcoming.count,
            })
          : t('noUpcoming')}
      </p>
      {stillDue > 0 && (
        <>
          <p className="text-meta text-muted-foreground">
            {t('skippedLeft', { count: stillDue })}
          </p>
          <Button variant="outline" size="sm" onClick={onRestart}>
            {t('restart')}
          </Button>
        </>
      )}
    </div>
  );
}

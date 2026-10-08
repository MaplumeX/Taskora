import { useCallback, useEffect, useRef, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, ChevronDown, ChevronLeft, LogOut, Play, SkipForward } from 'lucide-react';

import {
  useAreasQuery,
  useMarkAreaReviewed,
  useMarkProjectReviewed,
  useProjectsQuery,
  useReviewQueueQuery,
} from '@taskora/api';
import type { AreaResponseDto, ProjectResponseDto, ReviewQueueItem } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Hint } from '@/components/ui/hint';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PageHeading } from '@/components/layout/PageHeading';
import { reviewNav } from '@/components/layout/navItems';
import { ReviewList } from '@/components/review/ReviewList';
import { ReviewQueueList } from '@/components/review/ReviewQueueList';
import { ReviewScheduleChips, type ReviewTarget } from '@/components/review/ReviewSchedule';
import { ReviewModeContext } from '@/components/review/reviewMode';
import { registerReviewCommands } from '@/components/review/reviewCommands';
import {
  parseReviewPath,
  REVIEW_ROUTE,
  reviewPath,
  useReviewSession,
  type ReviewSession,
} from '@/components/review/reviewSession';
import { useIsDesktop } from '../lib/use-media-query';
import { cn } from '@/lib/utils';

import AreaDetail from './AreaDetail';
import ProjectDetail from './ProjectDetail';

/**
 * Review：`/review` 是回顾列表（Review List），列出所有参与回顾的对象；
 * 从列表进入某个对象即开始一轮回顾模式（Review Mode，见 CONTEXT.md）。
 * 每一步是当前 Project / Area 的完整可编辑页面，外面套一条回顾栏。
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

  // 从列表进入时压入一条历史，之后步进都是替换：退出（含系统返回）回到
  // 列表。直接打开某个对象（刷新、深链）时列表不在身后，替换过去。
  const listBehind = useRef(false);
  const exit = useCallback(() => {
    if (listBehind.current) {
      listBehind.current = false;
      navigate(-1);
    } else {
      navigate(REVIEW_ROUTE, { replace: true });
    }
  }, [navigate]);
  const open = (item: ReviewQueueItem) => {
    listBehind.current = true;
    navigate(reviewPath(item));
  };
  const go = useCallback(
    (item: ReviewQueueItem | null) => {
      if (item) {
        navigate(reviewPath(item), { replace: true });
        return;
      }
      toast.success(t('doneTitle'));
      exit();
    },
    [navigate, exit, t],
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

  if (current === null) {
    const dueCount = queue?.items.length ?? 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <PageHeading nav={REVIEW_ROUTE}>{t('title')}</PageHeading>
          <Button
            size="sm"
            disabled={dueCount === 0}
            onClick={() => queue && open(queue.items[0])}
          >
            <Play />
            {t('start')}
          </Button>
        </div>
        {queue && projects && areas && (
          <ReviewList queue={queue} projects={projects} areas={areas} onOpen={open} />
        )}
      </div>
    );
  }

  if (session.index < 0) return null;

  const target =
    current.kind === 'project'
      ? projects?.find((p) => p.id === current.id)
      : areas?.find((a) => a.id === current.id);

  return (
    <ReviewModeContext.Provider value>
      <div className="flex flex-col gap-4">
        <ReviewBar
          session={session}
          target={target ? { ...target, kind: current.kind } : null}
          projects={projects}
          areas={areas}
          onExit={exit}
        />
        <Routes>
          <Route path="project/:id" element={<ReviewStep kind="project" />} />
          <Route path="area/:id" element={<ReviewStep kind="area" />} />
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
  /** 当前对象（加载中为 null）。 */
  target: ReviewTarget | null;
  projects: readonly ProjectResponseDto[] | undefined;
  areas: readonly AreaResponseDto[] | undefined;
  onExit: () => void;
}

/**
 * 回顾栏：进度、间隔与下次回顾日（可编辑）、标记已回顾 / 跳过 / 上一个 /
 * 退出。点进度展开本轮队列（桌面端弹层、手机端左侧抽屉）。桌面端是页面
 * 顶部的一条；手机端顶部放进度与日期，底部工具栏放「上一个 / 跳过 /
 * 标记已回顾」，系统返回回到列表。
 */
function ReviewBar({ session, target, projects, areas, onExit }: ReviewBarProps) {
  const { t } = useTranslation('review');
  const desktop = useIsDesktop();
  const [queueOpen, setQueueOpen] = useState(false);
  const total = session.snapshot?.length ?? 0;
  const inStep = target !== null;
  const Icon = reviewNav.icon;

  const progressButton = (
    <button
      type="button"
      aria-label={t('queue')}
      aria-expanded={queueOpen}
      className="-mx-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-meta font-medium tabular-nums text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      onClick={desktop ? undefined : () => setQueueOpen(true)}
    >
      <Icon className={cn('h-4 w-4', reviewNav.colorClass)} />
      {t('title')}
      <span>{t('progress', { current: session.index + 1, total })}</span>
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
  const queueList = (
    <ReviewQueueList
      session={session}
      projects={projects}
      areas={areas}
      onPicked={() => setQueueOpen(false)}
    />
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
        <div className="flex flex-col items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
          {progressButton}
          {chips}
        </div>
        <Drawer open={queueOpen} onOpenChange={setQueueOpen}>
          <DrawerContent>
            <DrawerTitle>{t('queue')}</DrawerTitle>
            <div className="min-h-0 flex-1 overflow-y-auto px-2">{queueList}</div>
          </DrawerContent>
        </Drawer>
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
      <Popover open={queueOpen} onOpenChange={setQueueOpen}>
        <PopoverTrigger asChild>{progressButton}</PopoverTrigger>
        <PopoverContent align="start" className="max-h-[60vh] w-72 overflow-y-auto p-1">
          {queueList}
        </PopoverContent>
      </Popover>
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

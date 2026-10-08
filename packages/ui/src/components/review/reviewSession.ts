/**
 * 回顾模式（Review Mode，见 CONTEXT.md）的会话逻辑：进入时把回顾队列取成
 * 快照，之后按快照逐个前进。快照只活在本次访问中（组件状态），不持久化、
 * 不同步；重新进入（含刷新）即按当时的待回顾集合重建，从第一个开始。
 *
 * 当前对象由路由表示（`/review/project/:id`、`/review/area/:id`），走完
 * 快照为 `/review/done`。步进一律替换历史记录：系统返回直接退出回顾模式。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { projectTakesPartInReview } from '@taskora/api';
import {
  type AreaResponseDto,
  type ProjectResponseDto,
  type ReviewQueueItem,
} from '@taskora/shared';

export const REVIEW_ROUTE = '/review';
export const REVIEW_DONE_ROUTE = `${REVIEW_ROUTE}/done`;

export function reviewPath(item: ReviewQueueItem | null): string {
  return item ? `${REVIEW_ROUTE}/${item.kind}/${item.id}` : REVIEW_DONE_ROUTE;
}

/** `/review/*` 的剩余路径 → 当前对象；`done` 或无法识别为 null。 */
export function parseReviewPath(rest: string | undefined): ReviewQueueItem | null {
  const match = /^(project|area)\/([^/]+)$/.exec(rest ?? '');
  return match ? { kind: match[1] as ReviewQueueItem['kind'], id: match[2] } : null;
}

function sameItem(a: ReviewQueueItem | null, b: ReviewQueueItem): boolean {
  return a !== null && a.kind === b.kind && a.id === b.id;
}

/**
 * 对象是否已离开回顾（了结、进 Trash 或被删除）：项目不在未进 Trash 的
 * 项目列表里或已不是 ACTIVE，区域不在区域列表里。列表未加载时不判定。
 */
export function reviewItemGone(
  item: ReviewQueueItem,
  projects: readonly ProjectResponseDto[] | undefined,
  areas: readonly AreaResponseDto[] | undefined,
): boolean {
  if (item.kind === 'area') return areas !== undefined && !areas.some((a) => a.id === item.id);
  if (projects === undefined) return false;
  const project = projects.find((p) => p.id === item.id);
  return !project || !projectTakesPartInReview(project);
}

/** 快照中 from 之后第一个仍在回顾里的位置；没有则 null（走完）。 */
export function nextReviewIndex(
  snapshot: readonly ReviewQueueItem[],
  from: number,
  gone: (item: ReviewQueueItem) => boolean,
): number | null {
  for (let i = from + 1; i < snapshot.length; i += 1) if (!gone(snapshot[i])) return i;
  return null;
}

/** 快照中 from 之前最近一个仍在回顾里的位置（可回到已标记的对象）；没有则 null。 */
export function previousReviewIndex(
  snapshot: readonly ReviewQueueItem[],
  from: number,
  gone: (item: ReviewQueueItem) => boolean,
): number | null {
  for (let i = Math.min(from, snapshot.length) - 1; i >= 0; i -= 1) {
    if (!gone(snapshot[i])) return i;
  }
  return null;
}

export interface ReviewSessionInput {
  /** 当前的待回顾队列；加载中为 undefined。快照只取第一次拿到的结果。 */
  queueItems: readonly ReviewQueueItem[] | undefined;
  projects: readonly ProjectResponseDto[] | undefined;
  areas: readonly AreaResponseDto[] | undefined;
  /** 路由上的当前对象；`/review/done` 为 null。 */
  current: ReviewQueueItem | null;
  /** 替换式跳转到某个对象（null 为走完）。 */
  go: (item: ReviewQueueItem | null) => void;
  /** 标记已回顾（写入在后台进行，不阻塞前进）。 */
  markReviewed: (item: ReviewQueueItem) => void;
}

export interface ReviewSession {
  /** 快照；建立之前为 null（队列加载中）。 */
  snapshot: readonly ReviewQueueItem[] | null;
  /** 当前对象在快照中的位置；走完或不在快照里为 -1。 */
  index: number;
  markNext: () => void;
  skip: () => void;
  previous: () => void;
  canGoPrevious: boolean;
  /** 按当时的待回顾集合重新取快照，从第一个开始。 */
  restart: () => void;
}

export function useReviewSession(input: ReviewSessionInput): ReviewSession {
  const { queueItems, projects, areas, current, go, markReviewed } = input;
  const [snapshot, setSnapshot] = useState<readonly ReviewQueueItem[] | null>(null);

  const gone = useCallback(
    (item: ReviewQueueItem) => reviewItemGone(item, projects, areas),
    [projects, areas],
  );

  // 进入（含刷新）：第一次拿到队列时取快照，从第一个开始
  useEffect(() => {
    if (snapshot !== null || queueItems === undefined) return;
    const taken = [...queueItems];
    setSnapshot(taken);
    go(taken[0] ?? null);
  }, [snapshot, queueItems, go]);

  const index = snapshot ? snapshot.findIndex((item) => sameItem(current, item)) : -1;

  const advance = useCallback(() => {
    if (!snapshot || index < 0) return;
    const next = nextReviewIndex(snapshot, index, gone);
    go(next === null ? null : snapshot[next]);
  }, [snapshot, index, gone, go]);

  // 当前对象被了结、进 Trash 或删除：自动进入下一个（不需要标记已回顾）
  const currentGone = index >= 0 && gone(snapshot![index]);
  const advancedFrom = useRef<number | null>(null);
  useEffect(() => {
    if (!currentGone || advancedFrom.current === index) return;
    advancedFrom.current = index;
    advance();
  }, [currentGone, index, advance]);

  const markNext = useCallback(() => {
    if (!snapshot || index < 0) return;
    markReviewed(snapshot[index]);
    advance();
  }, [snapshot, index, markReviewed, advance]);

  const previousIndex = snapshot
    ? previousReviewIndex(snapshot, index < 0 ? snapshot.length : index, gone)
    : null;

  const previous = useCallback(() => {
    if (snapshot && previousIndex !== null) go(snapshot[previousIndex]);
  }, [snapshot, previousIndex, go]);

  const restart = useCallback(() => setSnapshot(null), []);

  return {
    snapshot,
    index,
    markNext,
    skip: advance,
    previous,
    canGoPrevious: previousIndex !== null,
    restart,
  };
}

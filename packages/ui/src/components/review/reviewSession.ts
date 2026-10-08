/**
 * 回顾模式（Review Mode，见 CONTEXT.md）的会话逻辑。`/review` 是回顾列表
 * （Review List），从列表进入某个对象即开始一轮回顾：把当时的待回顾队列
 * 取成快照（进入的对象不在其中时放在最前），之后按快照逐个前进。快照只活
 * 在本次访问中（组件状态），不持久化、不同步；回到列表即结束本轮，刷新
 * 则按当时的待回顾集合重建。
 *
 * 当前对象由路由表示（`/review/project/:id`、`/review/area/:id`）。步进一律
 * 替换历史记录：系统返回直接回到列表。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { projectTakesPartInReview } from '@taskora/api';
import {
  type AreaResponseDto,
  type ProjectResponseDto,
  type ReviewQueueItem,
} from '@taskora/shared';

export const REVIEW_ROUTE = '/review';

export function reviewPath(item: ReviewQueueItem | null): string {
  return item ? `${REVIEW_ROUTE}/${item.kind}/${item.id}` : REVIEW_ROUTE;
}

/** `/review/*` 的剩余路径 → 当前对象；列表或无法识别为 null。 */
export function parseReviewPath(rest: string | undefined): ReviewQueueItem | null {
  const match = /^(project|area)\/([^/]+)$/.exec(rest ?? '');
  return match ? { kind: match[1] as ReviewQueueItem['kind'], id: match[2] } : null;
}

export function sameReviewItem(a: ReviewQueueItem | null, b: ReviewQueueItem): boolean {
  return a !== null && a.kind === b.kind && a.id === b.id;
}

const itemKey = (item: ReviewQueueItem) => `${item.kind}:${item.id}`;

/** 一轮回顾的快照：待回顾队列；进入的对象不在其中（尚未到期）时放在最前。 */
export function reviewSnapshot(
  due: readonly ReviewQueueItem[],
  entry: ReviewQueueItem,
): ReviewQueueItem[] {
  return due.some((item) => sameReviewItem(entry, item)) ? [...due] : [entry, ...due];
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
  /** 当前的待回顾队列；加载中为 undefined。快照只在进入时取一次。 */
  queueItems: readonly ReviewQueueItem[] | undefined;
  projects: readonly ProjectResponseDto[] | undefined;
  areas: readonly AreaResponseDto[] | undefined;
  /** 路由上的当前对象；在列表上为 null。 */
  current: ReviewQueueItem | null;
  /** 替换式跳转到某个对象；null 为走完本轮。 */
  go: (item: ReviewQueueItem | null) => void;
  /** 标记已回顾（写入在后台进行，不阻塞前进）。 */
  markReviewed: (item: ReviewQueueItem) => void;
}

/** 快照中一个对象在本轮的状态（回顾栏的队列列表用）。 */
export type ReviewItemStatus = 'current' | 'reviewed' | 'skipped' | 'gone' | 'pending';

export interface ReviewSession {
  /** 本轮快照；在列表上或队列加载中为 null。 */
  snapshot: readonly ReviewQueueItem[] | null;
  /** 当前对象在快照中的位置；不在快照里为 -1。 */
  index: number;
  markNext: () => void;
  skip: () => void;
  previous: () => void;
  canGoPrevious: boolean;
  /** 跳到快照中的任一对象。 */
  jump: (item: ReviewQueueItem) => void;
  statusOf: (item: ReviewQueueItem) => ReviewItemStatus;
}

export function useReviewSession(input: ReviewSessionInput): ReviewSession {
  const { queueItems, projects, areas, current, go, markReviewed } = input;
  const [snapshot, setSnapshot] = useState<readonly ReviewQueueItem[] | null>(null);
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set());
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set());

  const gone = useCallback(
    (item: ReviewQueueItem) => reviewItemGone(item, projects, areas),
    [projects, areas],
  );

  const index = snapshot ? snapshot.findIndex((item) => sameReviewItem(current, item)) : -1;

  // 回到列表即结束本轮；进入对象（含刷新、深链）时没有本轮快照或对象不在
  // 快照里：按当时的待回顾队列开始新一轮
  useEffect(() => {
    if (current === null) {
      if (snapshot !== null) {
        setSnapshot(null);
        setReviewed(new Set());
        setVisited(new Set());
      }
      return;
    }
    if (queueItems === undefined || index >= 0) return;
    setSnapshot(reviewSnapshot(queueItems, current));
    setReviewed(new Set());
    setVisited(new Set());
  }, [current, snapshot, queueItems, index]);

  const currentKey = index >= 0 ? itemKey(snapshot![index]) : null;
  useEffect(() => {
    if (currentKey === null) return;
    setVisited((prev) => (prev.has(currentKey) ? prev : new Set(prev).add(currentKey)));
  }, [currentKey]);

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
    const item = snapshot[index];
    markReviewed(item);
    setReviewed((prev) => new Set(prev).add(itemKey(item)));
    advance();
  }, [snapshot, index, markReviewed, advance]);

  const previousIndex =
    snapshot && index >= 0 ? previousReviewIndex(snapshot, index, gone) : null;

  const previous = useCallback(() => {
    if (snapshot && previousIndex !== null) go(snapshot[previousIndex]);
  }, [snapshot, previousIndex, go]);

  const statusOf = useCallback(
    (item: ReviewQueueItem): ReviewItemStatus => {
      if (sameReviewItem(current, item)) return 'current';
      if (reviewed.has(itemKey(item))) return 'reviewed';
      if (gone(item)) return 'gone';
      return visited.has(itemKey(item)) ? 'skipped' : 'pending';
    },
    [current, reviewed, visited, gone],
  );

  return {
    snapshot,
    index,
    markNext,
    skip: advance,
    previous,
    canGoPrevious: previousIndex !== null,
    jump: go,
    statusOf,
  };
}

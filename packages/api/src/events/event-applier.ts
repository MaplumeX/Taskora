import { QueryClient } from '@tanstack/react-query';
import { hidesTasksInLaterProjects, HeadingStatus } from '@taskora/shared';
import { buildTagTree, type TagParents } from '@taskora/engine';
import type {
  AreaResponseDto,
  ChangeEvent,
  ProjectHeadingResponseDto,
  ProjectResponseDto,
  SubtaskResponseDto,
  TagResponseDto,
  TaskResponseDto,
} from '@taskora/shared';

import { projectLaterKind } from '@/utils/date';
import { taskMatchesQuery } from './task-query-match';

/**
 * Change Event applier: pure cache surgery over a QueryClient. No network,
 * no connection logic — those live in event-stream-client.ts.
 *
 * created/updated upsert the entity into every cached list it belongs to
 * (per the entity's view filter logic) and remove it from the ones it left;
 * deleted removes it everywhere. Upserted lists are re-sorted with the same
 * comparator the server uses, so reorder bursts converge to the final order.
 * Caches that embed derived data (feed, tag groups embedding tags, task
 * details after a subtask delete) fall back to invalidateQueries — once per
 * batch, never per event.
 */

interface Entity {
  id: string;
  position?: string | null;
}

/** Server list ordering (every entity is positioned): Position, byte order. */
function byPosition(a: Entity, b: Entity): number {
  const pa = a.position ?? '';
  const pb = b.position ?? '';
  return pa < pb ? -1 : pa > pb ? 1 : 0;
}

const taskComparator = (a: TaskResponseDto, b: TaskResponseDto) => byPosition(a, b);
const headingComparator = (a: ProjectHeadingResponseDto, b: ProjectHeadingResponseDto) =>
  byPosition(a, b);

/** Apply a (coalesced) batch of Change Events to the cache. */
export function applyChangeEvents(queryClient: QueryClient, batch: ChangeEvent[]): void {
  const merged = dedupeEvents(batch);
  // Derived cache roots invalidated once at the end (set semantics).
  const invalidate = new Set<string>();

  for (const event of merged) {
    switch (event.entity) {
      case 'task': {
        if (event.action === 'deleted') {
          removeFromLists(queryClient, 'tasks', event.id);
          queryClient.removeQueries({ queryKey: ['task', event.id] });
        } else if (event.data) {
          upsertTaskLists(queryClient, event.data);
          mergeTaskDetail(queryClient, event.data);
        }
        invalidate.add('feed');
        break;
      }
      case 'subtask': {
        if (event.action === 'deleted') {
          // A deleted subtask carries only its id — the parent task is not
          // locatable, so fall back to refetching task details.
          invalidate.add('task');
        } else if (event.data) {
          mergeSubtaskIntoTaskDetail(queryClient, event.data);
        }
        break;
      }
      case 'project': {
        if (event.action === 'deleted') {
          removeFromLists(queryClient, 'projects', event.id);
          queryClient.removeQueries({ queryKey: ['project', event.id] });
        } else if (event.data) {
          upsertInLists(queryClient, 'projects', event.data, () => true);
          overwriteDetail(queryClient, ['project', event.id], event.data);
        }
        invalidate.add('feed');
        invalidateTagTaskLists(queryClient);
        // 项目进出「稍后」会改变其下任务在 Anytime / Someday 列表中的归属。
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'tasks' &&
            hidesTasksInLaterProjects((query.queryKey[1] as { view?: string } | undefined)?.view),
        });
        break;
      }
      case 'project-heading': {
        if (event.action === 'deleted') {
          removeFromLists(queryClient, 'project-headings', event.id);
        } else if (event.data) {
          const heading = event.data;
          upsertInLists(
            queryClient,
            'project-headings',
            heading,
            (_item, key) => headingMatchesKey(heading, key),
            headingComparator,
          );
        }
        break;
      }
      case 'area': {
        if (event.action === 'deleted') {
          removeFromLists(queryClient, 'areas', event.id);
          queryClient.removeQueries({ queryKey: ['area', event.id] });
        } else if (event.data) {
          upsertInLists(queryClient, 'areas', event.data, () => true);
          overwriteDetail(queryClient, ['area', event.id], event.data);
        }
        invalidateTagTaskLists(queryClient);
        break;
      }
      case 'tag': {
        if (event.action === 'deleted') {
          removeFromLists(queryClient, 'tags', event.id);
          queryClient.removeQueries({ queryKey: ['tag', event.id] });
        } else if (event.data) {
          upsertInLists(queryClient, 'tags', event.data, () => true);
          overwriteDetail(queryClient, ['tag', event.id], event.data);
        }
        // Task/project/area/feed DTOs carry tag chips — invalidate
        // everything that embeds tags (this also covers tagId task lists,
        // whose subtree changes when a tag moves, ADR-0016).
        invalidate.add('tasks');
        invalidate.add('projects');
        invalidate.add('areas');
        invalidate.add('feed');
        break;
      }
    }
  }

  for (const key of invalidate) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Coalesce a burst: same entity+id collapses to the final action
 * (created+updated → created; anything+deleted → deleted; created+deleted
 * → dropped), mirroring the server-side transaction merge.
 */
export function dedupeEvents(batch: ChangeEvent[]): ChangeEvent[] {
  const merged = new Map<string, ChangeEvent>();
  for (const event of batch) {
    const key = `${event.entity}:${event.id}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...event });
      continue;
    }
    if (event.action === 'deleted') {
      if (previous.action === 'created') {
        merged.delete(key);
      } else {
        merged.set(key, { ...event, data: undefined });
      }
    } else {
      // Keep the freshest payload; created dominates updated.
      merged.set(key, {
        ...event,
        action: previous.action === 'created' ? 'created' : event.action,
      });
    }
  }
  return [...merged.values()];
}

// ---------- task surgery ----------

function upsertTaskLists(queryClient: QueryClient, task: TaskResponseDto): void {
  const isLaterProjectId = (projectId: string) => {
    for (const cache of listCaches(queryClient, 'projects')) {
      const project = (cache.data as ProjectResponseDto[]).find((p) => p.id === projectId);
      if (project) return projectLaterKind(project) !== null;
    }
    return false;
  };
  const tagParents = cachedTagParents(queryClient);
  for (const cache of listCaches(queryClient, 'tasks')) {
    const list = cache.data as TaskResponseDto[];
    const params = cache.key[1];
    const matches = taskMatchesQuery(task, params, new Date(), isLaterProjectId, tagParents);
    const without = list.filter((t) => t.id !== task.id);
    const next = matches ? [...without, task] : without;
    // logbook lists are ordered by completedAt desc server-side; every
    // other list by effective Position.
    if (params && typeof params === 'object' && (params as { view?: string }).view === 'logbook') {
      queryClient.setQueryData(
        cache.key,
        [...next].sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1)),
      );
    } else {
      queryClient.setQueryData(cache.key, [...next].sort(taskComparator));
    }
  }
}

/** 有效 Tag 的继承来源（ADR 0015）与 Tag 树（ADR-0016）：从缓存的列表里查。 */
function cachedTagParents(queryClient: QueryClient): TagParents {
  const find = <T extends { id: string }>(root: string, id: string): T | undefined => {
    for (const cache of listCaches(queryClient, root)) {
      const hit = (cache.data as T[]).find((item) => item.id === id);
      if (hit) return hit;
    }
    return undefined;
  };
  const tagIdsOf = (entity: { tags?: { id: string }[] }) => (entity.tags ?? []).map((t) => t.id);
  const tags = listCaches(queryClient, 'tags').flatMap((cache) => cache.data as TagResponseDto[]);
  const tree = buildTagTree(tags);
  return {
    subtreeOf: (tagId) => tree.descendantsOf(tagId),
    project: (id) => {
      const project = find<ProjectResponseDto>('projects', id);
      return project && { areaId: project.areaId, tagIds: tagIdsOf(project) };
    },
    area: (id) => {
      const area = find<AreaResponseDto>('areas', id);
      return area && { tagIds: tagIdsOf(area) };
    },
  };
}

/** Project / Area 的 Tag 或归属变化会改变其下任务在 tagId 列表中的去留（ADR 0015）。 */
function invalidateTagTaskLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'tasks' &&
      (query.queryKey[1] as { tagId?: string } | undefined)?.tagId !== undefined,
  });
}

function mergeTaskDetail(queryClient: QueryClient, task: TaskResponseDto): void {
  const key = ['task', task.id];
  const existing = queryClient.getQueryData<TaskResponseDto>(key);
  if (!existing) return; // never create detail-shaped caches from list DTOs
  // List payloads carry no subtasks — keep the cached ones.
  queryClient.setQueryData(key, { ...task, subtasks: existing.subtasks ?? [] });
}

function mergeSubtaskIntoTaskDetail(queryClient: QueryClient, subtask: SubtaskResponseDto): void {
  const key = ['task', subtask.taskId];
  const task = queryClient.getQueryData<TaskResponseDto>(key);
  if (!task) return;
  const subtasks = [...(task.subtasks ?? [])];
  const index = subtasks.findIndex((s) => s.id === subtask.id);
  if (index !== -1) {
    subtasks[index] = subtask;
  } else {
    subtasks.push(subtask);
  }
  queryClient.setQueryData(key, { ...task, subtasks: subtasks.sort(headingSubtaskComparator) });
}

const headingSubtaskComparator = (a: SubtaskResponseDto, b: SubtaskResponseDto) => byPosition(a, b);

// ---------- generic list surgery ----------

function headingMatchesKey(heading: ProjectHeadingResponseDto, key: readonly unknown[]): boolean {
  const params = (key[1] ?? {}) as { projectId?: string; includeArchived?: boolean };
  if (params.projectId !== undefined && heading.projectId !== params.projectId) return false;
  if (!params.includeArchived && heading.status !== HeadingStatus.ACTIVE) return false;
  return true;
}

function upsertInLists<T extends Entity>(
  queryClient: QueryClient,
  rootKey: string,
  entity: T,
  matches: (item: T, key: readonly unknown[]) => boolean,
  comparator: (a: T, b: T) => number = byPosition,
): void {
  for (const cache of listCaches(queryClient, rootKey)) {
    const list = cache.data as T[];
    const inThisList = matches(entity, cache.key);
    const without = list.filter((item) => item.id !== entity.id);
    queryClient.setQueryData(
      cache.key,
      inThisList ? [...without, entity].sort(comparator) : without,
    );
  }
}

function removeFromLists(queryClient: QueryClient, rootKey: string, id: string): void {
  for (const cache of listCaches(queryClient, rootKey)) {
    const list = cache.data as { id: string }[];
    if (!list.some((item) => item.id === id)) continue;
    queryClient.setQueryData(
      cache.key,
      list.filter((item) => item.id !== id),
    );
  }
}

function overwriteDetail(queryClient: QueryClient, key: readonly unknown[], data: unknown): void {
  if (queryClient.getQueryData(key) === undefined) return;
  queryClient.setQueryData(key, data);
}

function listCaches(
  queryClient: QueryClient,
  rootKey: string,
): { key: readonly unknown[]; data: unknown[] }[] {
  const caches: { key: readonly unknown[]; data: unknown[] }[] = [];
  for (const [key, data] of queryClient.getQueriesData({ queryKey: [rootKey] })) {
    if (Array.isArray(data)) {
      caches.push({ key, data });
    }
  }
  return caches;
}

// ---------- coalescing ----------

/**
 * Batches Change Events on a ~50ms window before applying them once, so a
 * burst (bulk reorder, batch assistant edits) renders once.
 */
export class EventStreamApplier {
  private queue: ChangeEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly queryClient: QueryClient,
    private readonly windowMs = 50,
  ) {}

  push(event: ChangeEvent): void {
    this.queue.push(event);
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.windowMs);
    }
  }

  /** Apply everything queued immediately (also used on disconnect). */
  flush(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    applyChangeEvents(this.queryClient, batch);
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

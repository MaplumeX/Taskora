import { QueryClient } from '@tanstack/react-query';
import {
  HeadingStatus,
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';
import type {
  AreaResponseDto,
  ChangeEvent,
  ProjectHeadingResponseDto,
  ProjectResponseDto,
  SubtaskResponseDto,
  TagGroupResponseDto,
  TagResponseDto,
  TaskResponseDto,
} from '@taskora/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { taskKeys } from '@/hooks/useTasks';
import { applyChangeEvents, dedupeEvents, EventStreamApplier } from './event-applier';

function makeTask(overrides: Partial<TaskResponseDto> = {}): TaskResponseDto {
  return {
    id: 'task-1',
    title: 'Task',
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId: null,
    headingId: null,
    areaId: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const event = (
  entity: ChangeEvent['entity'],
  id: string,
  action: ChangeEvent['action'],
  data?: unknown,
  seq = 1,
): ChangeEvent => ({ entity, id, action, seq, data: data as never });

describe('dedupeEvents', () => {
  it('merges created+updated into created with the freshest payload', () => {
    const merged = dedupeEvents([
      event('task', 't1', 'created', { title: 'first' }),
      event('task', 't1', 'updated', { title: 'second' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].action).toBe('created');
    expect(merged[0].data?.title).toBe('second');
  });

  it('merges updated+deleted into deleted without payload', () => {
    const merged = dedupeEvents([
      event('task', 't1', 'updated', { title: 'x' }),
      event('task', 't1', 'deleted'),
    ]);
    expect(merged).toEqual([expect.objectContaining({ action: 'deleted', id: 't1' })]);
    expect(merged[0].data).toBeUndefined();
  });

  it('drops created+deleted pairs', () => {
    const merged = dedupeEvents([
      event('task', 't1', 'created', { title: 'x' }),
      event('task', 't1', 'deleted'),
    ]);
    expect(merged).toEqual([]);
  });

  it('keeps unrelated entities separate', () => {
    const merged = dedupeEvents([
      event('task', 't1', 'created', { title: 'x' }),
      event('area', 'a1', 'created', { title: 'y' }),
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe('applyChangeEvents', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('upserts a created task into matching lists and skips others', () => {
    const inboxTask = makeTask();
    queryClient.setQueryData(taskKeys.list({ view: 'inbox' }), []);
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), []);

    applyChangeEvents(queryClient, [event('task', 'task-1', 'created', inboxTask)]);

    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'inbox' }))).toEqual([
      inboxTask,
    ]);
    // today requires scheduledType DATE
    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'today' }))).toEqual(
      [],
    );
  });

  it('moves a task between lists when its fields change (complete → logbook)', () => {
    const todayTask = makeTask({
      id: 'task-1',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-01-01T00:00:00.000Z',
    });
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [todayTask]);
    queryClient.setQueryData(taskKeys.list({ view: 'logbook' }), []);

    const completed = {
      ...todayTask,
      status: TaskStatus.COMPLETED,
      completedAt: '2026-01-02T00:00:00.000Z',
    };
    applyChangeEvents(queryClient, [event('task', 'task-1', 'updated', completed)]);

    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'today' }))).toEqual(
      [],
    );
    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'logbook' }))).toEqual(
      [completed],
    );
  });

  it('respects plain (non-view) list filters: projectId and default active-only', () => {
    const task = makeTask({ id: 'task-1', projectId: 'p1' });
    queryClient.setQueryData(taskKeys.list({ projectId: 'p1' }), []);
    queryClient.setQueryData(taskKeys.list({ projectId: 'p2' }), []);
    queryClient.setQueryData(taskKeys.list(), []);
    queryClient.setQueryData(taskKeys.list({ completed: true }), []);

    applyChangeEvents(queryClient, [event('task', 'task-1', 'created', task)]);

    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ projectId: 'p1' }))).toEqual(
      [task],
    );
    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ projectId: 'p2' }))).toEqual(
      [],
    );
    // Default list (no filters): active non-trashed tasks.
    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list())).toEqual([task]);
    // completed=true list also holds active tasks.
    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ completed: true }))).toEqual(
      [task],
    );
  });

  it('removes a deleted task from all lists and clears its detail', () => {
    const task = makeTask();
    queryClient.setQueryData(taskKeys.list({ view: 'inbox' }), [task]);
    queryClient.setQueryData(taskKeys.detail('task-1'), { ...task, subtasks: [] });

    applyChangeEvents(queryClient, [event('task', 'task-1', 'deleted')]);

    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'inbox' }))).toEqual(
      [],
    );
    expect(queryClient.getQueryData(taskKeys.detail('task-1'))).toBeUndefined();
  });

  it('merges task detail updates while preserving cached subtasks', () => {
    const subtasks: SubtaskResponseDto[] = [
      {
        id: 'st-1',
        title: 'Step',
        status: TaskStatus.ACTIVE,
        completedAt: null,
        sortOrder: 0,
        taskId: 'task-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    queryClient.setQueryData(taskKeys.detail('task-1'), { ...makeTask(), subtasks });

    applyChangeEvents(queryClient, [
      event('task', 'task-1', 'updated', makeTask({ title: 'New' })),
    ]);

    const detail = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'));
    expect(detail?.title).toBe('New');
    expect(detail?.subtasks).toEqual(subtasks);
  });

  it('never creates a detail cache from a list payload', () => {
    applyChangeEvents(queryClient, [event('task', 'task-1', 'created', makeTask())]);
    expect(queryClient.getQueryData(taskKeys.detail('task-1'))).toBeUndefined();
  });

  it('applies subtask events to the parent task detail', () => {
    const detail = { ...makeTask(), subtasks: [] as SubtaskResponseDto[] };
    queryClient.setQueryData(taskKeys.detail('task-1'), detail);

    const subtask: SubtaskResponseDto = {
      id: 'st-1',
      title: 'Step',
      status: TaskStatus.ACTIVE,
      completedAt: null,
      sortOrder: 0,
      taskId: 'task-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    applyChangeEvents(queryClient, [event('subtask', 'st-1', 'created', subtask)]);
    expect(queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'))?.subtasks).toEqual([
      subtask,
    ]);

    applyChangeEvents(queryClient, [
      event('subtask', 'st-1', 'updated', { ...subtask, status: TaskStatus.COMPLETED }),
    ]);
    expect(
      queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'))?.subtasks?.[0]?.status,
    ).toBe('COMPLETED');

    // Deleted subtasks carry only an id — task details are invalidated.
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    applyChangeEvents(queryClient, [event('subtask', 'st-1', 'deleted')]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['task'] });
    spy.mockRestore();
  });

  it('upserts projects, areas, tags and tag groups into their lists', () => {
    const project: ProjectResponseDto = {
      id: 'p1',
      title: 'P',
      notes: null,
      sortOrder: 0,
      areaId: null,
      status: ProjectStatus.ACTIVE,
      bucket: ProjectBucket.ANYTIME,
      taskTotalCount: 0,
      taskCompletedCount: 0,
      scheduledType: ScheduledType.NONE,
      scheduledDate: null,
      dueDate: null,
      completedAt: null,
      trashedAt: null,
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const area: AreaResponseDto = {
      id: 'a1',
      title: 'A',
      notes: null,
      sortOrder: 0,
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const tag: TagResponseDto = {
      id: 'g1',
      title: 'T',
      color: '#3B82F6',
      sortOrder: 0,
      tagGroupId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const group: TagGroupResponseDto = {
      id: 'tg1',
      title: 'G',
      sortOrder: 0,
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    queryClient.setQueryData(['projects'], []);
    queryClient.setQueryData(['areas'], []);
    queryClient.setQueryData(['tags'], []);
    queryClient.setQueryData(['tag-groups'], []);

    applyChangeEvents(queryClient, [
      event('project', 'p1', 'created', project),
      event('area', 'a1', 'created', area),
      event('tag', 'g1', 'created', tag),
      event('tag-group', 'tg1', 'created', group),
    ]);

    expect(queryClient.getQueryData<ProjectResponseDto[]>(['projects'])).toEqual([project]);
    expect(queryClient.getQueryData<AreaResponseDto[]>(['areas'])).toEqual([area]);
    expect(queryClient.getQueryData<TagResponseDto[]>(['tags'])).toEqual([tag]);
    expect(queryClient.getQueryData<TagGroupResponseDto[]>(['tag-groups'])).toEqual([group]);

    applyChangeEvents(queryClient, [
      event('project', 'p1', 'deleted'),
      event('area', 'a1', 'deleted'),
      event('tag', 'g1', 'deleted'),
      event('tag-group', 'tg1', 'deleted'),
    ]);
    expect(queryClient.getQueryData<ProjectResponseDto[]>(['projects'])).toEqual([]);
    expect(queryClient.getQueryData<AreaResponseDto[]>(['areas'])).toEqual([]);
    expect(queryClient.getQueryData<TagResponseDto[]>(['tags'])).toEqual([]);
    expect(queryClient.getQueryData<TagGroupResponseDto[]>(['tag-groups'])).toEqual([]);
  });

  it('invalidates feed once per batch for task events', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(taskKeys.list(), []);

    applyChangeEvents(queryClient, [
      event('task', 't1', 'created', makeTask({ id: 't1' })),
      event('task', 't2', 'created', makeTask({ id: 't2' })),
    ]);

    const countCalls = (root: string) =>
      spy.mock.calls.filter(([arg]) => {
        const key = (arg as { queryKey: readonly unknown[] }).queryKey;
        return key[0] === root;
      }).length;
    expect(countCalls('feed')).toBe(1);
    spy.mockRestore();
  });

  it('invalidates tag-embedding caches when a tag changes', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['tags'], []);

    const tag: TagResponseDto = {
      id: 'g1',
      title: 'Renamed',
      color: '#3B82F6',
      sortOrder: 0,
      tagGroupId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    applyChangeEvents(queryClient, [event('tag', 'g1', 'updated', tag)]);

    const invalidatedRoots = new Set(
      spy.mock.calls.map(([arg]) => (arg as { queryKey: readonly unknown[] }).queryKey[0]),
    );
    // Tasks/projects/areas/feed/tag-groups all embed tag chips.
    expect(invalidatedRoots).toEqual(new Set(['tag-groups', 'tasks', 'projects', 'areas', 'feed']));
    spy.mockRestore();
  });

  it('filters project headings by project and archive flag', () => {
    const heading: ProjectHeadingResponseDto = {
      id: 'h1',
      projectId: 'p1',
      title: 'H',
      sortOrder: 0,
      status: HeadingStatus.ACTIVE,
      completedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const activeKey = ['project-headings', { projectId: 'p1', includeArchived: false }];
    const archivedKey = ['project-headings', { projectId: 'p1', includeArchived: true }];
    const otherKey = ['project-headings', { projectId: 'p2', includeArchived: false }];
    queryClient.setQueryData(activeKey, []);
    queryClient.setQueryData(archivedKey, []);
    queryClient.setQueryData(otherKey, []);

    applyChangeEvents(queryClient, [event('project-heading', 'h1', 'created', heading)]);
    expect(queryClient.getQueryData<ProjectHeadingResponseDto[]>(activeKey)).toEqual([heading]);
    expect(queryClient.getQueryData<ProjectHeadingResponseDto[]>(archivedKey)).toEqual([heading]);
    expect(queryClient.getQueryData<ProjectHeadingResponseDto[]>(otherKey)).toEqual([]);

    // Archived heading leaves the non-archived list but stays in the other.
    const archived = { ...heading, status: HeadingStatus.COMPLETED };
    applyChangeEvents(queryClient, [event('project-heading', 'h1', 'updated', archived)]);
    expect(queryClient.getQueryData<ProjectHeadingResponseDto[]>(activeKey)).toEqual([]);
    expect(queryClient.getQueryData<ProjectHeadingResponseDto[]>(archivedKey)).toEqual([archived]);

    applyChangeEvents(queryClient, [event('project-heading', 'h1', 'deleted')]);
    expect(queryClient.getQueryData<ProjectHeadingResponseDto[]>(archivedKey)).toEqual([]);
  });

  it('re-sorts upserted task lists by the server ordering (sortOrder, createdAt)', () => {
    const older = makeTask({ id: 't-old', sortOrder: 5, createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeTask({ id: 't-new', sortOrder: 5, createdAt: '2026-01-02T00:00:00.000Z' });
    queryClient.setQueryData(taskKeys.list(), [older]);

    applyChangeEvents(queryClient, [event('task', 't-new', 'created', newer)]);
    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list())).toEqual([newer, older]);
  });
});

describe('EventStreamApplier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces events pushed within the window into one apply', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'setQueryData');
    queryClient.setQueryData(taskKeys.list(), []);

    const applier = new EventStreamApplier(queryClient, 50);
    applier.push(event('task', 't1', 'created', makeTask({ id: 't1' })));
    applier.push(event('task', 't2', 'created', makeTask({ id: 't2' })));
    applier.push(event('task', 't3', 'created', makeTask({ id: 't3' })));

    // Nothing applied before the window elapses: one batch, applied at
    // once — React Query batches the notifications into a single render.
    expect(queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list())).toEqual([]);
    spy.mockClear();

    vi.advanceTimersByTime(50);

    const list = queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list());
    expect(list?.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3']);
  });
});

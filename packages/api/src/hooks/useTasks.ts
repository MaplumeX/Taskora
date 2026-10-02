import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { QueryCacheFacade } from '../engine/live-queries';
import { taskUpdatePutsBack } from '@taskora/engine';
import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type {
  CreateSubtaskDto,
  CreateTaskDto,
  FeedItem,
  FeedOrderItem,
  SubtaskResponseDto,
  TaskResponseDto,
  UpdateSubtaskDto,
  UpdateTaskDto,
} from '@taskora/shared';

import {
  cancelSubtask,
  cancelTask,
  completeSubtask,
  completeTask,
  convertTaskToProject,
  createSubtask,
  createTask,
  deleteSubtask,
  deleteTask,
  getTask,
  getTasks,
  reorderFeed,
  reorderSubtasks,
  reorderTasks,
  restoreTask,
  searchTasks,
  skipTask,
  type TaskQuery,
  uncancelSubtask,
  uncancelTask,
  uncompleteSubtask,
  uncompleteTask,
  updateSubtask,
  updateTask,
} from '@/api/tasks.api';
import {
  type CacheSnapshot,
  cancelRoots,
  refreshAfterWrite,
  restoreSnapshot,
  snapshotRoots,
  useQueryCache,
} from './cache-patches';
import { useDebouncedValue } from './useDebouncedValue';
import { useLiveQueryMode, useReplicaQuery } from './useEngineQuery';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (params?: TaskQuery) => ['tasks', params ?? {}] as const,
  detail: (id: string) => ['task', id] as const,
};

// Engine 模式的查询依赖（local-first-v3 issue 06）：任务行嵌入标签芯片，
// 详情另含子任务；tagId 按有效 Tag 匹配，还依赖 Project / Area 的 Tag（ADR 0015）。
export function useTasksQuery(params?: TaskQuery, options?: { enabled?: boolean }) {
  return useReplicaQuery({
    queryKey: taskKeys.list(params),
    queryFn: () => getTasks(params),
    dependsOn: params?.tagId ? ['task', 'tag', 'project', 'area'] : ['task', 'tag'],
    enabled: options?.enabled,
  });
}

// 键不挂在 taskKeys.all 下：那里的缓存按 TaskResponseDto[] 就地改写。
export const taskSearchKeys = {
  search: (q: string, extended: boolean) => ['task-search', q, extended] as const,
};

/**
 * 任务搜索（Quick Find）。输入先防抖：本地副本只合并连续击键（50ms），
 * REST 回退 300ms。空白搜索词不查询。searchedQuery 为本次结果对应的
 * 搜索词（高亮用，与结果同步）。
 */
export function useTaskSearchQuery(q: string, options?: { extended?: boolean }) {
  const engineMode = useLiveQueryMode();
  const searchedQuery = useDebouncedValue(q.trim(), engineMode ? 50 : 300);
  const extended = options?.extended === true;
  const result = useReplicaQuery({
    queryKey: taskSearchKeys.search(searchedQuery, extended),
    queryFn: () => searchTasks(searchedQuery, { extended }),
    dependsOn: ['task', 'subtask', 'tag'],
    enabled: searchedQuery.length > 0,
  });
  return { ...result, searchedQuery };
}

export function useTaskQuery(id: string) {
  return useReplicaQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => getTask(id),
    dependsOn: [{ entity: 'task', ids: [id] }, 'subtask', 'tag'],
    enabled: !!id,
  });
}

// Helper: apply a change to a task in a list array
function applyToTaskInList(
  list: TaskResponseDto[] | undefined,
  taskId: string,
  updater: (task: TaskResponseDto) => TaskResponseDto,
): TaskResponseDto[] | undefined {
  if (!list) return list;
  return list.map((t) => (t.id === taskId ? updater(t) : t));
}

// Helper: remove a task from a list array
function removeTaskFromList(
  list: TaskResponseDto[] | undefined,
  taskId: string,
): TaskResponseDto[] | undefined {
  if (!list) return list;
  return list.filter((t) => t.id !== taskId);
}

// Optimistic updates must cover both list families: ['tasks'] (TaskList
// views) and ['feed'] (Inbox/Today/Anytime/... — most of the app). Patching
// only ['tasks'] leaves feed views showing the old state until the refetch
// lands, e.g. a dropped row snapping back before jumping to its new slot.
const TASK_LIST_ROOTS = ['tasks', 'feed'];

async function cancelTaskLists(queryClient: QueryCacheFacade) {
  await cancelRoots(queryClient, TASK_LIST_ROOTS);
}

function snapshotTaskLists(queryClient: QueryCacheFacade): CacheSnapshot {
  return snapshotRoots(queryClient, TASK_LIST_ROOTS);
}

type ListItem = { id: string; type?: string };

/** Only task rows: feed lists mix tasks and projects that may share nothing but shape. */
function isTaskRow(item: ListItem): boolean {
  return item.type === undefined || item.type === 'task';
}

function patchTaskInLists(
  queryClient: QueryCacheFacade,
  taskId: string,
  updater: (task: TaskResponseDto) => TaskResponseDto,
) {
  queryClient.setQueriesData<TaskResponseDto[]>({ queryKey: taskKeys.all }, (old) =>
    applyToTaskInList(old, taskId, updater),
  );
  queryClient.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, (old) =>
    old?.map((item) =>
      item.type === 'task' && item.id === taskId
        ? ({ ...updater(item as unknown as TaskResponseDto), type: 'task' } as FeedItem)
        : item,
    ),
  );
}

function removeTaskFromLists(queryClient: QueryCacheFacade, taskId: string) {
  queryClient.setQueriesData<TaskResponseDto[]>({ queryKey: taskKeys.all }, (old) =>
    removeTaskFromList(old, taskId),
  );
  queryClient.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, (old) =>
    old?.filter((item) => !(item.type === 'task' && item.id === taskId)),
  );
}

/**
 * Reorder the task rows of a list in place: the slots currently held by
 * reordered tasks are refilled in the new order; every other row (projects
 * in feeds, tasks outside the dragged set) keeps its slot. Works for any
 * list shape, so partial views and mixed feeds get the new order at once.
 */
export function reorderInSlots<T extends ListItem>(list: T[], orderedIds: string[]): T[] {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const slots: number[] = [];
  list.forEach((item, index) => {
    if (isTaskRow(item) && rank.has(item.id)) slots.push(index);
  });
  if (slots.length < 2) return list;
  const members = slots
    .map((index) => list[index])
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const next = [...list];
  slots.forEach((slot, index) => {
    next[slot] = members[index];
  });
  return next;
}

/**
 * feed 混排的槽位重排：按 items（任务与项目行）的目标顺序重排列表中的
 * 成员行，非成员行原位不动。任务行（tasks 列表无 type）按 task 计。
 */
export function reorderFeedInSlots<T extends ListItem>(list: T[], items: FeedOrderItem[]): T[] {
  const keyOf = (item: ListItem) => `${item.type ?? 'task'}:${item.id}`;
  const rank = new Map(items.map((item, index) => [`${item.type}:${item.id}`, index]));
  const slots: number[] = [];
  list.forEach((item, index) => {
    if (rank.has(keyOf(item))) slots.push(index);
  });
  if (slots.length < 2) return list;
  const members = slots
    .map((index) => list[index])
    .sort((a, b) => (rank.get(keyOf(a)) ?? 0) - (rank.get(keyOf(b)) ?? 0));
  const next = [...list];
  slots.forEach((slot, index) => {
    next[slot] = members[index];
  });
  return next;
}

export function useCreateTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (data: CreateTaskDto) => createTask(data),
    onMutate: async (data) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      const now = new Date().toISOString();
      const tempId = crypto.randomUUID();
      const tempTask: TaskResponseDto = {
        id: tempId,
        title: data.title,
        notes: data.notes ?? null,
        scheduledDate: data.scheduledDate ?? null,
        scheduledType: data.scheduledType ?? ScheduledType.NONE,
        reminderTime: null,
        repeatRule: null,
        repeatSourceId: null,
        dueDate: data.dueDate ?? null,
        bucket: data.bucket ?? TaskBucket.INBOX,
        status: TaskStatus.ACTIVE,
        completedAt: null,
        trashedAt: null,
        projectId: data.projectId ?? null,
        headingId: null,
        areaId: data.areaId ?? null,
        tags: [],
        subtasks: [],
        createdAt: now,
        updatedAt: now,
      };
      // 乐观插入置顶：与两种后端的列表语义一致（新任务 Position 排最前），避免回填真实值后任务
      // 从底部跳到顶部的视觉抖动。
      queryClient.setQueriesData<TaskResponseDto[]>({ queryKey: taskKeys.all }, (old) =>
        old ? [tempTask, ...old] : old,
      );
      return { snapshot, tempId };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
    },
    onSuccess: (task, _data, ctx) => {
      // Replace temp item with server-returned real value. 幂等：并发缓存
      // 更新（SSE 缓存手术 / 桌面 engine 写后失效引发的 refetch）可能
      // 已把真实行写入列表，temp 行已被冲掉——此时再首插会产生同 id
      // 重复条目（React duplicate key），新建行在去重调和时被卸载重建，
      // 自动聚焦的标题输入框随之丢焦。过滤两个 id 后只插入一次。
      const tempId = ctx?.tempId;
      queryClient.setQueriesData<TaskResponseDto[]>({ queryKey: taskKeys.all }, (old) => {
        if (!old) return old;
        const deduped = old.filter((t) => t.id !== tempId && t.id !== task.id);
        return [task, ...deduped];
      });
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) => updateTask(id, data),
    onMutate: async ({ id, data }) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(id));
      const now = new Date().toISOString();
      // Trash 中改日期 / 归属 / 标签等即放回（同 planTaskUpdate）
      const putBack = taskUpdatePutsBack(data) ? { trashedAt: null } : {};
      patchTaskInLists(queryClient, id, (task) => ({
          ...task,
          ...data,
          ...putBack,
          updatedAt: now,
        }));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, ...data, ...putBack, updatedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, { id }) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onMutate: async (id) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      removeTaskFromLists(queryClient, id);
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => completeTask(id),
    onMutate: async (id) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(id));
      const now = new Date().toISOString();
      patchTaskInLists(queryClient, id, (task) => ({
          ...task,
          status: TaskStatus.COMPLETED,
          completedAt: now,
        }));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, status: TaskStatus.COMPLETED, completedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useUncompleteTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => uncompleteTask(id),
    onMutate: async (id) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(id));
      patchTaskInLists(queryClient, id, (task) => ({
          ...task,
          status: TaskStatus.ACTIVE,
          completedAt: null,
        }));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, status: TaskStatus.ACTIVE, completedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useCancelTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => cancelTask(id),
    onMutate: async (id) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(id));
      const now = new Date().toISOString();
      patchTaskInLists(queryClient, id, (task) => ({
          ...task,
          status: TaskStatus.CANCELLED,
          completedAt: now,
        }));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, status: TaskStatus.CANCELLED, completedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useUncancelTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => uncancelTask(id),
    onMutate: async (id) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(id));
      patchTaskInLists(queryClient, id, (task) => ({
          ...task,
          status: TaskStatus.ACTIVE,
          completedAt: null,
        }));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, status: TaskStatus.ACTIVE, completedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

/**
 * 跳过本次（recurring-tasks-v2）：计划日期推进、Subtask 重置由数据层完成，
 * 不做乐观更新——目标日期依赖规则与账号时区，等写入结果刷新即可。
 */
export function useSkipTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => skipTask(id),
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useReorderTasks() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderTasks(orderedIds),
    onMutate: async (orderedIds) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      // 乐观重排 tasks 与 feed 两类列表（槽位保持：非成员行不动），松手
      // 即是新顺序，不再先弹回旧顺序等重查。
      for (const root of TASK_LIST_ROOTS) {
        queryClient.setQueriesData<ListItem[]>({ queryKey: [root] }, (old) =>
          old ? reorderInSlots(old, orderedIds) : old,
        );
      }
      return { snapshot };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.snapshot) restoreSnapshot(queryClient, ctx.snapshot);
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

/**
 * feed 拖拽重排（feed-project-ordering spec）：任务与项目行一起按显示顺序
 * 写回——任务写 position，项目写 feedPosition（不动侧边栏顺序）。
 */
export function useReorderFeed() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (items: FeedOrderItem[]) => reorderFeed(items),
    onMutate: async (items) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      for (const root of TASK_LIST_ROOTS) {
        queryClient.setQueriesData<ListItem[]>({ queryKey: [root] }, (old) =>
          old ? reorderFeedInSlots(old, items) : old,
        );
      }
      return { snapshot };
    },
    onError: (_err, _items, ctx) => {
      if (ctx?.snapshot) restoreSnapshot(queryClient, ctx.snapshot);
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useRestoreTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => restoreTask(id),
    onMutate: async (id) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(id));
      // 放回只清 trashedAt，了结状态保留（spec: trash-things3）。
      patchTaskInLists(queryClient, id, (task) => ({ ...task, trashedAt: null }));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, trashedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useConvertTaskToProject() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => convertTaskToProject(id),
    onSuccess: (_data, id) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: ['tasks'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

// ---------- Subtask hooks ----------

/**
 * Subtask 写入串行执行（乐观补丁仍即时生效）：连续插入时下一条以上一条的
 * 客户端 id 为 afterId，REST 模式下须等上一条落库后再发。
 */
const SUBTASK_WRITE_SCOPE = { id: 'subtask-write' };
const SUBTASK_WRITE_KEY = ['subtask-write'] as const;

/**
 * REST 模式的写后刷新：队列里还有后续 Subtask 写入时跳过——此时 refetch 会
 * 冲掉后续写入的乐观行（连续插入时正在输入的行会闪没、丢焦），由最后一个统一刷新。
 */
function useRefreshAfterSubtaskWrite() {
  const queryClient = useQueryCache();
  const mutations = useQueryClient();
  return () => {
    // 结算回调执行时自身仍计入 isMutating
    if (mutations.isMutating({ mutationKey: SUBTASK_WRITE_KEY }) > 1) return;
    refreshAfterWrite(queryClient, { queryKey: ['task'] });
    refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
    refreshAfterWrite(queryClient, { queryKey: ['feed'] });
  };
}

// Helper: apply a change to subtasks array within a task detail
function applyToSubtasks(
  task: TaskResponseDto | undefined,
  updater: (subtasks: SubtaskResponseDto[]) => SubtaskResponseDto[],
): TaskResponseDto | undefined {
  if (!task) return task;
  return { ...task, subtasks: updater(task.subtasks ?? []) };
}

function applyToSubtaskInArray(
  subtasks: SubtaskResponseDto[],
  subtaskId: string,
  updater: (subtask: SubtaskResponseDto) => SubtaskResponseDto,
): SubtaskResponseDto[] {
  return subtasks.map((s) => (s.id === subtaskId ? updater(s) : s));
}

export function useCreateSubtask() {
  const queryClient = useQueryCache();
  const refreshSubtaskWrites = useRefreshAfterSubtaskWrite();
  return useMutation({
    mutationKey: SUBTASK_WRITE_KEY,
    scope: SUBTASK_WRITE_SCOPE,
    mutationFn: ({ taskId, data }: { taskId: string; data: CreateSubtaskDto }) =>
      createSubtask(taskId, data),
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      const now = new Date().toISOString();
      // 带客户端 id 时乐观行即最终行，不必换 id（输入框不重建、不丢焦）
      const tempId = data.id ?? crypto.randomUUID();
      const tempSubtask: SubtaskResponseDto = {
        id: tempId,
        title: data.title,
        status: TaskStatus.ACTIVE,
        completedAt: null,
        taskId,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) => {
          const afterIndex = data.afterId ? subtasks.findIndex((s) => s.id === data.afterId) : -1;
          if (afterIndex < 0) return [...subtasks, tempSubtask];
          const next = [...subtasks];
          next.splice(afterIndex + 1, 0, tempSubtask);
          return next;
        }),
      );
      return { snapshot, tempId, taskId };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.taskId && ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    onSuccess: (subtask, _vars, ctx) => {
      // Replace temp subtask with server-returned real value
      const tempId = ctx?.tempId;
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(subtask.taskId), (old) =>
        applyToSubtasks(old, (subtasks) => {
          // 同 useCreateTask：幂等去重，防止并发缓存更新已写入真实行时
          // 重复追加（duplicate key → 卸载重建 → 丢焦）。
          // 原位替换，保留插入位置。
          const at = subtasks.findIndex((s) => s.id === tempId || s.id === subtask.id);
          const deduped = subtasks.filter((s) => s.id !== tempId && s.id !== subtask.id);
          if (at < 0) return [...deduped, subtask];
          deduped.splice(at, 0, subtask);
          return deduped;
        }),
      );
    },
    onSettled: () => refreshSubtaskWrites(),
  });
}

export function useUpdateSubtask() {
  const queryClient = useQueryCache();
  const refreshSubtaskWrites = useRefreshAfterSubtaskWrite();
  return useMutation({
    mutationKey: SUBTASK_WRITE_KEY,
    scope: SUBTASK_WRITE_SCOPE,
    mutationFn: ({ id, data }: { id: string; data: UpdateSubtaskDto }) => updateSubtask(id, data),
    onMutate: async ({ id, data }) => {
      // Find taskId from current detail cache
      const queries = queryClient.getQueriesData<TaskResponseDto>({
        queryKey: taskKeys.all,
      });
      let taskId: string | undefined;
      for (const [, taskData] of queries) {
        if (taskData?.subtasks?.some((s) => s.id === id)) {
          taskId = taskData.id;
          break;
        }
      }
      // If not found in list, search detail caches
      if (!taskId) {
        const detailQueries = queryClient.getQueriesData<TaskResponseDto>({
          queryKey: ['task'],
        });
        for (const [, taskData] of detailQueries) {
          if (taskData?.subtasks?.some((s) => s.id === id)) {
            taskId = taskData.id;
            break;
          }
        }
      }
      if (!taskId) return { taskId: undefined };
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      const now = new Date().toISOString();
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) =>
          applyToSubtaskInArray(subtasks, id, (s) => ({
            ...s,
            ...data,
            updatedAt: now,
          })),
        ),
      );
      return { taskId, snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.taskId && ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    onSettled: () => refreshSubtaskWrites(),
  });
}

export function useDeleteSubtask() {
  const queryClient = useQueryCache();
  const refreshSubtaskWrites = useRefreshAfterSubtaskWrite();
  return useMutation({
    mutationKey: SUBTASK_WRITE_KEY,
    scope: SUBTASK_WRITE_SCOPE,
    mutationFn: ({ id }: { id: string; taskId: string }) => deleteSubtask(id),
    onMutate: async ({ id, taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) => subtasks.filter((s) => s.id !== id)),
      );
      return { taskId, snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    onSettled: () => refreshSubtaskWrites(),
  });
}

export function useCompleteSubtask() {
  const queryClient = useQueryCache();
  const refreshSubtaskWrites = useRefreshAfterSubtaskWrite();
  return useMutation({
    mutationKey: SUBTASK_WRITE_KEY,
    scope: SUBTASK_WRITE_SCOPE,
    mutationFn: (id: string) => completeSubtask(id),
    onMutate: async (id) => {
      // Find taskId from detail caches
      const detailQueries = queryClient.getQueriesData<TaskResponseDto>({
        queryKey: ['task'],
      });
      let taskId: string | undefined;
      for (const [, taskData] of detailQueries) {
        if (taskData?.subtasks?.some((s) => s.id === id)) {
          taskId = taskData.id;
          break;
        }
      }
      if (!taskId) return { taskId: undefined };
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      const now = new Date().toISOString();
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) =>
          applyToSubtaskInArray(subtasks, id, (s) => ({
            ...s,
            status: TaskStatus.COMPLETED,
            completedAt: now,
            updatedAt: now,
          })),
        ),
      );
      return { taskId, snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.taskId && ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    onSettled: () => refreshSubtaskWrites(),
  });
}

export function useUncompleteSubtask() {
  const queryClient = useQueryCache();
  const refreshSubtaskWrites = useRefreshAfterSubtaskWrite();
  return useMutation({
    mutationKey: SUBTASK_WRITE_KEY,
    scope: SUBTASK_WRITE_SCOPE,
    mutationFn: (id: string) => uncompleteSubtask(id),
    onMutate: async (id) => {
      // Find taskId from detail caches
      const detailQueries = queryClient.getQueriesData<TaskResponseDto>({
        queryKey: ['task'],
      });
      let taskId: string | undefined;
      for (const [, taskData] of detailQueries) {
        if (taskData?.subtasks?.some((s) => s.id === id)) {
          taskId = taskData.id;
          break;
        }
      }
      if (!taskId) return { taskId: undefined };
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      const now = new Date().toISOString();
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) =>
          applyToSubtaskInArray(subtasks, id, (s) => ({
            ...s,
            status: TaskStatus.ACTIVE,
            completedAt: null,
            updatedAt: now,
          })),
        ),
      );
      return { taskId, snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.taskId && ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    onSettled: () => refreshSubtaskWrites(),
  });
}

export function useCancelSubtask() {
  const queryClient = useQueryCache();
  const refreshSubtaskWrites = useRefreshAfterSubtaskWrite();
  return useMutation({
    mutationKey: SUBTASK_WRITE_KEY,
    scope: SUBTASK_WRITE_SCOPE,
    mutationFn: (id: string) => cancelSubtask(id),
    onMutate: async (id) => {
      // Find taskId from detail caches
      const detailQueries = queryClient.getQueriesData<TaskResponseDto>({
        queryKey: ['task'],
      });
      let taskId: string | undefined;
      for (const [, taskData] of detailQueries) {
        if (taskData?.subtasks?.some((s) => s.id === id)) {
          taskId = taskData.id;
          break;
        }
      }
      if (!taskId) return { taskId: undefined };
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      const now = new Date().toISOString();
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) =>
          applyToSubtaskInArray(subtasks, id, (s) => ({
            ...s,
            status: TaskStatus.CANCELLED,
            completedAt: now,
            updatedAt: now,
          })),
        ),
      );
      return { taskId, snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.taskId && ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    onSettled: () => refreshSubtaskWrites(),
  });
}

export function useUncancelSubtask() {
  const queryClient = useQueryCache();
  const refreshSubtaskWrites = useRefreshAfterSubtaskWrite();
  return useMutation({
    mutationKey: SUBTASK_WRITE_KEY,
    scope: SUBTASK_WRITE_SCOPE,
    mutationFn: (id: string) => uncancelSubtask(id),
    onMutate: async (id) => {
      // Find taskId from detail caches
      const detailQueries = queryClient.getQueriesData<TaskResponseDto>({
        queryKey: ['task'],
      });
      let taskId: string | undefined;
      for (const [, taskData] of detailQueries) {
        if (taskData?.subtasks?.some((s) => s.id === id)) {
          taskId = taskData.id;
          break;
        }
      }
      if (!taskId) return { taskId: undefined };
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      const now = new Date().toISOString();
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) =>
          applyToSubtaskInArray(subtasks, id, (s) => ({
            ...s,
            status: TaskStatus.ACTIVE,
            completedAt: null,
            updatedAt: now,
          })),
        ),
      );
      return { taskId, snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.taskId && ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    onSettled: () => refreshSubtaskWrites(),
  });
}

export function useReorderSubtasks() {
  const queryClient = useQueryCache();
  const refreshSubtaskWrites = useRefreshAfterSubtaskWrite();
  return useMutation({
    mutationKey: SUBTASK_WRITE_KEY,
    scope: SUBTASK_WRITE_SCOPE,
    mutationFn: ({ taskId, orderedIds }: { taskId: string; orderedIds: string[] }) =>
      reorderSubtasks(taskId, orderedIds),
    onMutate: async ({ taskId, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      const rank = new Map(orderedIds.map((id, index) => [id, index]));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) =>
          [...subtasks].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)),
        ),
      );
      return { snapshot };
    },
    onError: (_err, { taskId }, ctx) => {
      if (ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(taskId), ctx.snapshot);
      }
    },
    onSettled: () => refreshSubtaskWrites(),
  });
}

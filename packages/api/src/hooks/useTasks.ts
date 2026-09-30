import { useMutation } from '@tanstack/react-query';

import type { QueryCacheFacade } from '../engine/live-queries';
import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type {
  CreateSubtaskDto,
  CreateTaskDto,
  FeedItem,
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
  reorderSubtasks,
  reorderTasks,
  restoreTask,
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
import { useReplicaQuery } from './useEngineQuery';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (params?: TaskQuery) => ['tasks', params ?? {}] as const,
  detail: (id: string) => ['task', id] as const,
};

// Engine 模式的查询依赖（local-first-v3 issue 06）：任务行嵌入标签芯片，
// 详情另含子任务。
export function useTasksQuery(params?: TaskQuery, options?: { enabled?: boolean }) {
  return useReplicaQuery({
    queryKey: taskKeys.list(params),
    queryFn: () => getTasks(params),
    dependsOn: ['task', 'tag'],
    enabled: options?.enabled,
  });
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
        sortOrder: 0,
        projectId: data.projectId ?? null,
        headingId: null,
        areaId: data.areaId ?? null,
        tags: [],
        subtasks: [],
        createdAt: now,
        updatedAt: now,
      };
      // 乐观插入置顶：与两种后端的列表语义一致（REST：sortOrder 同为 0、
      // createdAt desc；Engine：positionAfter 头部），避免回填真实值后任务
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
      patchTaskInLists(queryClient, id, (task) => ({
          ...task,
          ...data,
          updatedAt: now,
        }));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, ...data, updatedAt: now } : old,
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

export function useRestoreTask() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => restoreTask(id),
    onMutate: async (id) => {
      await cancelTaskLists(queryClient);
      const snapshot = snapshotTaskLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(id));
      patchTaskInLists(queryClient, id, (task) => ({
          ...task,
          trashedAt: null,
          // "从垃圾桶捡回"始终是未了结（spec: task-cancelled story 19）。
          status: TaskStatus.ACTIVE,
          completedAt: null,
        }));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, trashedAt: null, status: TaskStatus.ACTIVE, completedAt: null } : old,
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
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: CreateSubtaskDto }) =>
      createSubtask(taskId, data),
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      const now = new Date().toISOString();
      const tempId = crypto.randomUUID();
      const tempSubtask: SubtaskResponseDto = {
        id: tempId,
        title: data.title,
        status: TaskStatus.ACTIVE,
        completedAt: null,
        sortOrder: snapshot?.subtasks?.length ?? 0,
        taskId,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) => [...subtasks, tempSubtask]),
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
          const deduped = subtasks.filter((s) => s.id !== tempId && s.id !== subtask.id);
          return [...deduped, subtask];
        }),
      );
    },
    onSettled: (_data, _error, { taskId }) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(taskId) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useUpdateSubtask() {
  const queryClient = useQueryCache();
  return useMutation({
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
    onSettled: (data, _error, _vars, ctx) => {
      const taskId = ctx?.taskId ?? data?.taskId;
      if (taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(taskId),
        });
      }
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useDeleteSubtask() {
  const queryClient = useQueryCache();
  return useMutation({
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
    onSettled: (_data, _error, { taskId }) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(taskId) });
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useCompleteSubtask() {
  const queryClient = useQueryCache();
  return useMutation({
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
    onSettled: (subtask, _error, _id, ctx) => {
      if (ctx?.taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(ctx.taskId),
        });
      } else if (subtask?.taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(subtask.taskId),
        });
      }
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useUncompleteSubtask() {
  const queryClient = useQueryCache();
  return useMutation({
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
    onSettled: (subtask, _error, _id, ctx) => {
      if (ctx?.taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(ctx.taskId),
        });
      } else if (subtask?.taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(subtask.taskId),
        });
      }
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useCancelSubtask() {
  const queryClient = useQueryCache();
  return useMutation({
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
    onSettled: (subtask, _error, _id, ctx) => {
      if (ctx?.taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(ctx.taskId),
        });
      } else if (subtask?.taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(subtask.taskId),
        });
      }
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useUncancelSubtask() {
  const queryClient = useQueryCache();
  return useMutation({
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
    onSettled: (subtask, _error, _id, ctx) => {
      if (ctx?.taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(ctx.taskId),
        });
      } else if (subtask?.taskId) {
        refreshAfterWrite(queryClient, {
          queryKey: taskKeys.detail(subtask.taskId),
        });
      }
      refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useReorderSubtasks() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: ({ taskId, orderedIds }: { taskId: string; orderedIds: string[] }) =>
      reorderSubtasks(taskId, orderedIds),
    onSuccess: (_data, { taskId }) => {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(taskId) });
    },
  });
}

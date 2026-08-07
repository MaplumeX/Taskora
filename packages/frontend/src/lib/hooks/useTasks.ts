import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';
import type {
  CreateSubtaskDto,
  CreateTaskDto,
  SubtaskResponseDto,
  TaskResponseDto,
  UpdateSubtaskDto,
  UpdateTaskDto,
} from '@taskora/shared';

import {
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
  type TaskQuery,
  uncompleteSubtask,
  uncompleteTask,
  updateSubtask,
  updateTask,
} from '@/lib/api/tasks.api';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (params?: TaskQuery) => ['tasks', params ?? {}] as const,
  detail: (id: string) => ['task', id] as const,
};

export function useTasksQuery(
  params?: TaskQuery,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: taskKeys.list(params),
    queryFn: () => getTasks(params),
    enabled: options?.enabled,
  });
}

export function useTaskQuery(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => getTask(id),
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

// Restore snapshot to queries data (list caches)
function restoreListSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly string[],
  snapshot: [readonly unknown[], unknown][],
) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key as readonly string[], data);
  }
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskDto) => createTask(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = queryClient.getQueriesData<TaskResponseDto[]>({
        queryKey: taskKeys.all,
      });
      const now = new Date().toISOString();
      const tempId = crypto.randomUUID();
      const tempTask: TaskResponseDto = {
        id: tempId,
        title: data.title,
        notes: data.notes ?? null,
        scheduledDate: data.scheduledDate ?? null,
        scheduledType: data.scheduledType ?? ScheduledType.NONE,
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
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) => (old ? [...old, tempTask] : old),
      );
      return { snapshot, tempId };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, taskKeys.all, ctx.snapshot);
      }
    },
    onSuccess: (task, _data, ctx) => {
      // Replace temp item with server-returned real value
      const tempId = ctx?.tempId;
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) => {
          if (!old) return old;
          if (tempId) {
            const withoutTemp = old.filter((t) => t.id !== tempId);
            return [...withoutTemp, task];
          }
          return [...old, task];
        },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) =>
      updateTask(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = queryClient.getQueriesData<TaskResponseDto[]>({
        queryKey: taskKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(id),
      );
      const now = new Date().toISOString();
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) =>
          applyToTaskInList(old, id, (task) => ({
            ...task,
            ...data,
            updatedAt: now,
          })),
      );
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, ...data, updatedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, taskKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = queryClient.getQueriesData<TaskResponseDto[]>({
        queryKey: taskKeys.all,
      });
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) => removeTaskFromList(old, id),
      );
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, taskKeys.all, ctx.snapshot);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = queryClient.getQueriesData<TaskResponseDto[]>({
        queryKey: taskKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(id),
      );
      const now = new Date().toISOString();
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) =>
          applyToTaskInList(old, id, (task) => ({
            ...task,
            status: TaskStatus.COMPLETED,
            completedAt: now,
          })),
      );
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, status: TaskStatus.COMPLETED, completedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, taskKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUncompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => uncompleteTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = queryClient.getQueriesData<TaskResponseDto[]>({
        queryKey: taskKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(id),
      );
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) =>
          applyToTaskInList(old, id, (task) => ({
            ...task,
            status: TaskStatus.ACTIVE,
            completedAt: null,
          })),
      );
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, status: TaskStatus.ACTIVE, completedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, taskKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderTasks(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) => {
          if (!old) return old;
          const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
          return [...old].sort((a, b) => {
            const ai = orderMap.get(a.id);
            const bi = orderMap.get(b.id);
            if (ai !== undefined && bi !== undefined) return ai - bi;
            return 0;
          });
        },
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useRestoreTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      const snapshot = queryClient.getQueriesData<TaskResponseDto[]>({
        queryKey: taskKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(id),
      );
      queryClient.setQueriesData<TaskResponseDto[]>(
        { queryKey: taskKeys.all },
        (old) =>
          applyToTaskInList(old, id, (task) => ({
            ...task,
            trashedAt: null,
          })),
      );
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(id), (old) =>
        old ? { ...old, trashedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, taskKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useConvertTaskToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => convertTaskToProject(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: CreateSubtaskDto }) =>
      createSubtask(taskId, data),
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(taskId),
      );
      const now = new Date().toISOString();
      const tempId = crypto.randomUUID();
      const tempSubtask: SubtaskResponseDto = {
        id: tempId,
        title: data.title,
        status: TaskStatus.ACTIVE,
        completedAt: null,
        sortOrder: (snapshot?.subtasks?.length ?? 0),
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
      queryClient.setQueryData<TaskResponseDto>(
        taskKeys.detail(subtask.taskId),
        (old) =>
          applyToSubtasks(old, (subtasks) => {
            if (tempId) {
              const withoutTemp = subtasks.filter((s) => s.id !== tempId);
              return [...withoutTemp, subtask];
            }
            return [...subtasks, subtask];
          }),
      );
    },
    onSettled: (_data, _error, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUpdateSubtask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSubtaskDto }) =>
      updateSubtask(id, data),
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
      const snapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(taskId),
      );
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
        void queryClient.invalidateQueries({
          queryKey: taskKeys.detail(taskId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useDeleteSubtask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; taskId: string }) => deleteSubtask(id),
    onMutate: async ({ id, taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(taskId),
      );
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToSubtasks(old, (subtasks) =>
          subtasks.filter((s) => s.id !== id),
        ),
      );
      return { taskId, snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    onSettled: (_data, _error, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useCompleteSubtask() {
  const queryClient = useQueryClient();
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
      const snapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(taskId),
      );
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
        void queryClient.invalidateQueries({
          queryKey: taskKeys.detail(ctx.taskId),
        });
      } else if (subtask?.taskId) {
        void queryClient.invalidateQueries({
          queryKey: taskKeys.detail(subtask.taskId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUncompleteSubtask() {
  const queryClient = useQueryClient();
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
      const snapshot = queryClient.getQueryData<TaskResponseDto>(
        taskKeys.detail(taskId),
      );
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
        void queryClient.invalidateQueries({
          queryKey: taskKeys.detail(ctx.taskId),
        });
      } else if (subtask?.taskId) {
        void queryClient.invalidateQueries({
          queryKey: taskKeys.detail(subtask.taskId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useReorderSubtasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, orderedIds }: { taskId: string; orderedIds: string[] }) =>
      reorderSubtasks(taskId, orderedIds),
    onSuccess: (_data, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
    },
  });
}
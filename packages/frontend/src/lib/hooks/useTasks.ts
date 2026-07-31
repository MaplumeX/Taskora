import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskDto) => createTask(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) => updateTask(id, data),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeTask(id),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUncompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => uncompleteTask(id),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
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
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
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

export function useCreateSubtask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: CreateSubtaskDto }) =>
      createSubtask(taskId, data),
    onSuccess: (subtask) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(subtask.taskId) });
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
    onSuccess: (subtask) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(subtask.taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useDeleteSubtask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; taskId: string }) =>
      deleteSubtask(id),
    onSuccess: (_data, { taskId }) => {
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
    onSuccess: (subtask: SubtaskResponseDto) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(subtask.taskId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUncompleteSubtask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => uncompleteSubtask(id),
    onSuccess: (subtask: SubtaskResponseDto) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(subtask.taskId) });
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
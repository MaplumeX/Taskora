import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateTaskDto, UpdateTaskDto } from '@taskora/shared';

import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  getTasks,
  restoreTask,
  type TaskQuery,
  uncompleteTask,
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
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
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
    },
  });
}
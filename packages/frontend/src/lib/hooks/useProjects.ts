import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateProjectDto, ProjectResponseDto, UpdateProjectDto } from '@taskora/shared';

import {
  createProject,
  deleteProject,
  getProjects,
  reorderProjects,
  updateProject,
} from '@/lib/api/projects.api';

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['project', id] as const,
};

export function useProjectsQuery() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: getProjects,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectDto) => createProject(data),
    onSuccess: (project) => {
      // 乐观写入新条目，使详情页首次 render 即可拿到 project，
      // 让 pendingAutoEditId 驱动的自动编辑态能正常触发。
      queryClient.setQueryData<ProjectResponseDto[]>(projectKeys.all, (old) =>
        old ? [...old, project] : old,
      );
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectDto }) =>
      updateProject(id, data),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useReorderProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderProjects(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      queryClient.setQueriesData<ProjectResponseDto[]>(
        { queryKey: projectKeys.all },
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
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
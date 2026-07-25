import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateProjectDto, UpdateProjectDto } from '@taskora/shared';

import {
  createProject,
  deleteProject,
  getProjects,
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
    onSuccess: () => {
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

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
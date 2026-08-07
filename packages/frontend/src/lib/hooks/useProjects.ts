import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
} from '@taskora/shared';
import type {
  CreateProjectDto,
  ProjectResponseDto,
  UpdateProjectDto,
} from '@taskora/shared';

import {
  completeProject,
  createProject,
  deleteProject,
  getProjects,
  reorderProjects,
  restoreProject,
  uncompleteProject,
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

// Helper: apply a change to a project in a list array
function applyToProjectInList(
  list: ProjectResponseDto[] | undefined,
  projectId: string,
  updater: (project: ProjectResponseDto) => ProjectResponseDto,
): ProjectResponseDto[] | undefined {
  if (!list) return list;
  return list.map((p) => (p.id === projectId ? updater(p) : p));
}

// Helper: remove a project from a list array
function removeProjectFromList(
  list: ProjectResponseDto[] | undefined,
  projectId: string,
): ProjectResponseDto[] | undefined {
  if (!list) return list;
  return list.filter((p) => p.id !== projectId);
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

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectDto) => createProject(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const snapshot = queryClient.getQueriesData<ProjectResponseDto[]>({
        queryKey: projectKeys.all,
      });
      const now = new Date().toISOString();
      const tempId = crypto.randomUUID();
      const tempProject: ProjectResponseDto = {
        id: tempId,
        title: data.title,
        notes: data.notes ?? null,
        areaId: data.areaId ?? null,
        sortOrder: 0,
        status: ProjectStatus.ACTIVE,
        bucket: data.bucket ?? ProjectBucket.INBOX,
        scheduledType: data.scheduledType ?? ScheduledType.NONE,
        scheduledDate: data.scheduledDate ?? null,
        dueDate: data.dueDate ?? null,
        completedAt: null,
        trashedAt: null,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueriesData<ProjectResponseDto[]>(
        { queryKey: projectKeys.all },
        (old) => (old ? [...old, tempProject] : old),
      );
      return { snapshot, tempId };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, projectKeys.all, ctx.snapshot);
      }
    },
    onSuccess: (project, _data, ctx) => {
      // Replace temp item with server-returned real value
      const tempId = ctx?.tempId;
      queryClient.setQueriesData<ProjectResponseDto[]>(
        { queryKey: projectKeys.all },
        (old) => {
          if (!old) return old;
          if (tempId) {
            const withoutTemp = old.filter((p) => p.id !== tempId);
            return [...withoutTemp, project];
          }
          return [...old, project];
        },
      );
      // Set detail cache so detail page can read immediately
      queryClient.setQueryData(projectKeys.detail(project.id), project);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectDto }) =>
      updateProject(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const snapshot = queryClient.getQueriesData<ProjectResponseDto[]>({
        queryKey: projectKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<ProjectResponseDto>(
        projectKeys.detail(id),
      );
      const now = new Date().toISOString();
      queryClient.setQueriesData<ProjectResponseDto[]>(
        { queryKey: projectKeys.all },
        (old) =>
          applyToProjectInList(old, id, (project) => ({
            ...project,
            ...data,
            updatedAt: now,
          })),
      );
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(id), (old) =>
        old ? { ...old, ...data, updatedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, projectKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(projectKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useRestoreProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreProject(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const snapshot = queryClient.getQueriesData<ProjectResponseDto[]>({
        queryKey: projectKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<ProjectResponseDto>(
        projectKeys.detail(id),
      );
      queryClient.setQueriesData<ProjectResponseDto[]>(
        { queryKey: projectKeys.all },
        (old) =>
          applyToProjectInList(old, id, (project) => ({
            ...project,
            trashedAt: null,
          })),
      );
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(id), (old) =>
        old ? { ...old, trashedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, projectKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(projectKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useCompleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeProject(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const snapshot = queryClient.getQueriesData<ProjectResponseDto[]>({
        queryKey: projectKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<ProjectResponseDto>(
        projectKeys.detail(id),
      );
      const now = new Date().toISOString();
      queryClient.setQueriesData<ProjectResponseDto[]>(
        { queryKey: projectKeys.all },
        (old) =>
          applyToProjectInList(old, id, (project) => ({
            ...project,
            status: ProjectStatus.COMPLETED,
            completedAt: now,
          })),
      );
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(id), (old) =>
        old ? { ...old, status: ProjectStatus.COMPLETED, completedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, projectKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(projectKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useUncompleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => uncompleteProject(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const snapshot = queryClient.getQueriesData<ProjectResponseDto[]>({
        queryKey: projectKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<ProjectResponseDto>(
        projectKeys.detail(id),
      );
      queryClient.setQueriesData<ProjectResponseDto[]>(
        { queryKey: projectKeys.all },
        (old) =>
          applyToProjectInList(old, id, (project) => ({
            ...project,
            status: ProjectStatus.ACTIVE,
            completedAt: null,
          })),
      );
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(id), (old) =>
        old ? { ...old, status: ProjectStatus.ACTIVE, completedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, projectKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(projectKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
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
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const snapshot = queryClient.getQueriesData<ProjectResponseDto[]>({
        queryKey: projectKeys.all,
      });
      queryClient.setQueriesData<ProjectResponseDto[]>(
        { queryKey: projectKeys.all },
        (old) => removeProjectFromList(old, id),
      );
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, projectKeys.all, ctx.snapshot);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
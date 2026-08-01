import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProjectHeadingDto,
  ProjectHeadingResponseDto,
  ReorderProjectHeadingLayoutDto,
  TaskResponseDto,
  UpdateProjectHeadingDto,
} from '@taskora/shared';

import {
  convertProjectHeadingToProject,
  createProjectHeading,
  deleteProjectHeading,
  getProjectHeadings,
  reorderProjectHeadingLayout,
  updateProjectHeading,
} from '@/lib/api/project-headings.api';
import { taskKeys } from './useTasks';

export const projectHeadingKeys = {
  all: ['project-headings'] as const,
  list: (projectId: string) => ['project-headings', { projectId }] as const,
};

export function useProjectHeadingsQuery(projectId?: string) {
  return useQuery({
    queryKey: projectHeadingKeys.list(projectId ?? ''),
    queryFn: () => getProjectHeadings(projectId!),
    enabled: !!projectId,
  });
}

function invalidateProjectData(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  void queryClient.invalidateQueries({
    queryKey: projectHeadingKeys.list(projectId),
  });
  void queryClient.invalidateQueries({ queryKey: taskKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['feed'] });
}

export function useCreateProjectHeading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectHeadingDto) => createProjectHeading(data),
    onSuccess: (heading) => {
      invalidateProjectData(queryClient, heading.projectId);
    },
  });
}

export function useUpdateProjectHeading(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectHeadingDto }) =>
      updateProjectHeading(id, data),
    onSuccess: () => {
      invalidateProjectData(queryClient, projectId);
    },
  });
}

export function useDeleteProjectHeading(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProjectHeading(id),
    onSuccess: () => {
      invalidateProjectData(queryClient, projectId);
    },
  });
}

export function useConvertProjectHeadingToProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => convertProjectHeadingToProject(id),
    onSuccess: () => {
      // Heading list + tasks + feed for the source project, and the sidebar
      // project list so the newly created project appears.
      invalidateProjectData(queryClient, projectId);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useReorderProjectHeadingLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReorderProjectHeadingLayoutDto) => reorderProjectHeadingLayout(data),
    onMutate: async (layout) => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: projectHeadingKeys.list(layout.projectId),
        }),
        queryClient.cancelQueries({ queryKey: taskKeys.all }),
      ]);

      const headingOrder = new Map(layout.groups.map((group, index) => [group.headingId, index]));
      queryClient.setQueryData<ProjectHeadingResponseDto[]>(
        projectHeadingKeys.list(layout.projectId),
        (old) =>
          old
            ? [...old]
                .map((heading) => ({
                  ...heading,
                  sortOrder: headingOrder.get(heading.id) ?? heading.sortOrder,
                }))
                .sort((a, b) => a.sortOrder - b.sortOrder)
            : old,
      );

      const taskLayout = new Map<
        string,
        {
          headingId: string | null;
          sortOrder: number;
        }
      >();
      layout.ungroupedTaskIds.forEach((id, sortOrder) => {
        taskLayout.set(id, { headingId: null, sortOrder });
      });
      layout.groups.forEach((group) => {
        group.taskIds.forEach((id, sortOrder) => {
          taskLayout.set(id, { headingId: group.headingId, sortOrder });
        });
      });
      queryClient.setQueriesData<TaskResponseDto[]>({ queryKey: taskKeys.all }, (old) => {
        if (!old) return old;
        const updated = old.map((task) => {
          const next = taskLayout.get(task.id);
          return next ? { ...task, ...next } : task;
        });
        const containerOrder = new Map<string | null, number>([
          [null, -1],
          ...layout.groups.map(
            (group, index) => [group.headingId, index] as [string | null, number],
          ),
        ]);
        return updated.sort((a, b) => {
          const aLayout = taskLayout.get(a.id);
          const bLayout = taskLayout.get(b.id);
          if (!aLayout || !bLayout) return 0;
          const containerDelta =
            (containerOrder.get(aLayout.headingId) ?? 0) -
            (containerOrder.get(bLayout.headingId) ?? 0);
          return containerDelta || aLayout.sortOrder - bLayout.sortOrder;
        });
      });
    },
    onError: (_error, layout) => {
      invalidateProjectData(queryClient, layout.projectId);
    },
    onSettled: (_data, _error, layout) => {
      invalidateProjectData(queryClient, layout.projectId);
    },
  });
}

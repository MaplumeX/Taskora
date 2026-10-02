import { useMutation } from '@tanstack/react-query';

import type { QueryCacheFacade } from '../engine/live-queries';
import type {
  CreateProjectHeadingDto,
  ProjectHeadingResponseDto,
  ReorderProjectHeadingLayoutDto,
  TaskResponseDto,
  UpdateProjectHeadingDto,
} from '@taskora/shared';

import {
  archiveProjectHeading,
  convertProjectHeadingToProject,
  createProjectHeading,
  deleteProjectHeading,
  getProjectHeadings,
  reorderProjectHeadingLayout,
  unarchiveProjectHeading,
  updateProjectHeading,
} from '@/api/project-headings.api';
import { taskKeys } from './useTasks';
import { refreshAfterWrite, useQueryCache } from './cache-patches';
import { useReplicaQuery } from './useEngineQuery';

export const projectHeadingKeys = {
  all: ['project-headings'] as const,
  list: (projectId: string, includeArchived?: boolean) =>
    ['project-headings', { projectId, includeArchived: includeArchived ?? false }] as const,
};

export function useProjectHeadingsQuery(
  projectId?: string,
  options?: { includeArchived?: boolean },
) {
  const includeArchived = options?.includeArchived;
  return useReplicaQuery({
    queryKey: projectHeadingKeys.list(projectId ?? '', includeArchived),
    queryFn: () => getProjectHeadings(projectId!, { includeArchived }),
    // 项目不存在时查询报错：项目行也是依赖
    dependsOn: ['project-heading', { entity: 'project', ids: [projectId ?? ''] }],
    enabled: !!projectId,
  });
}

/** 写入成功后的刷新：Engine 模式下由 Engine 变更通知负责（见 refreshAfterWrite）。 */
function refreshProjectData(queryClient: QueryCacheFacade, projectId: string) {
  refreshAfterWrite(queryClient, { queryKey: ['project-headings', { projectId }] });
  refreshAfterWrite(queryClient, { queryKey: taskKeys.all });
  refreshAfterWrite(queryClient, { queryKey: ['feed'] });
}

/** 失败恢复：无论哪种模式都重新读取（重排的乐观补丁没有快照可恢复）。 */
function invalidateProjectData(queryClient: QueryCacheFacade, projectId: string) {
  // Invalidate all heading query variants (active-only + includeArchived) for this project.
  void queryClient.invalidateQueries({
    queryKey: ['project-headings', { projectId }],
  });
  void queryClient.invalidateQueries({ queryKey: taskKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['feed'] });
}

export function useCreateProjectHeading() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (data: CreateProjectHeadingDto) => createProjectHeading(data),
    onSuccess: (heading) => {
      refreshProjectData(queryClient, heading.projectId);
    },
  });
}

export function useUpdateProjectHeading(projectId: string) {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectHeadingDto }) =>
      updateProjectHeading(id, data),
    onSuccess: () => {
      refreshProjectData(queryClient, projectId);
    },
  });
}

export function useDeleteProjectHeading(projectId: string) {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => deleteProjectHeading(id),
    onSuccess: () => {
      refreshProjectData(queryClient, projectId);
    },
  });
}

export function useConvertProjectHeadingToProject(projectId: string) {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => convertProjectHeadingToProject(id),
    onSuccess: () => {
      // Heading list + tasks + feed for the source project, and the sidebar
      // project list so the newly created project appears.
      refreshProjectData(queryClient, projectId);
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}

export function useArchiveProjectHeading(projectId: string) {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => archiveProjectHeading(id),
    onSuccess: () => {
      refreshProjectData(queryClient, projectId);
    },
  });
}

export function useUnarchiveProjectHeading(projectId: string) {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => unarchiveProjectHeading(id),
    onSuccess: () => {
      refreshProjectData(queryClient, projectId);
    },
  });
}

export function useReorderProjectHeadingLayout() {
  const queryClient = useQueryCache();
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
            ? [...old].sort(
                (a, b) =>
                  (headingOrder.get(a.id) ?? Infinity) - (headingOrder.get(b.id) ?? Infinity),
              )
            : old,
      );

      const taskLayout = new Map<
        string,
        {
          headingId: string | null;
          index: number;
        }
      >();
      layout.ungroupedTaskIds.forEach((id, index) => {
        taskLayout.set(id, { headingId: null, index });
      });
      layout.groups.forEach((group) => {
        group.taskIds.forEach((id, index) => {
          taskLayout.set(id, { headingId: group.headingId, index });
        });
      });
      queryClient.setQueriesData<TaskResponseDto[]>({ queryKey: taskKeys.all }, (old) => {
        if (!old) return old;
        const updated = old.map((task) => {
          const next = taskLayout.get(task.id);
          return next ? { ...task, headingId: next.headingId } : task;
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
          return containerDelta || aLayout.index - bLayout.index;
        });
      });
    },
    onError: (_error, layout) => {
      invalidateProjectData(queryClient, layout.projectId);
    },
    onSettled: (_data, _error, layout) => {
      refreshProjectData(queryClient, layout.projectId);
    },
  });
}

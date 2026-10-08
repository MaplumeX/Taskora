import { useMutation } from '@tanstack/react-query';

import type { QueryCacheFacade } from '../engine/live-queries';
import { projectUpdatePutsBack } from '@taskora/engine';
import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';
import type {
  CreateProjectDto,
  FeedItem,
  SettleRemainingTasks,
  ProjectResponseDto,
  UpdateProjectDto,
} from '@taskora/shared';

import {
  completeProject,
  createProject,
  deleteProject,
  getProject,
  getProjects,
  reorderProjects,
  restoreProject,
  skipProject,
  uncompleteProject,
  updateProject,
} from '@/api/projects.api';
import {
  type CacheSnapshot,
  cancelRoots,
  refreshAfterWrite,
  restoreSnapshot,
  snapshotRoots,
  useQueryCache,
} from './cache-patches';
import { useReplicaQuery } from './useEngineQuery';

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['project', id] as const,
};

// 项目带任务计数与标签芯片：依赖 task 与 tag（local-first-v3 issue 06）。
export function useProjectsQuery() {
  return useReplicaQuery({
    queryKey: projectKeys.all,
    queryFn: getProjects,
    dependsOn: ['project', 'task', 'tag'],
  });
}

export function useProjectQuery(id: string, options?: { enabled?: boolean }) {
  return useReplicaQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => getProject(id),
    dependsOn: [{ entity: 'project', ids: [id] }, 'task', 'tag'],
    enabled: !!id && (options?.enabled ?? true),
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

// 项目同时出现在 ['projects'] 列表与 ['feed'] 视图（Today / Upcoming /
// Someday / Logbook / Trash 的项目行）里：乐观补丁两处都改，否则 feed 视图
// 里的项目行要等重查才更新（local-first-v3 issue 02）。
const PROJECT_LIST_ROOTS = ['projects', 'feed'];

async function cancelProjectLists(queryClient: QueryCacheFacade) {
  await cancelRoots(queryClient, PROJECT_LIST_ROOTS);
}

function snapshotProjectLists(queryClient: QueryCacheFacade): CacheSnapshot {
  return snapshotRoots(queryClient, PROJECT_LIST_ROOTS);
}

function patchProjectInLists(
  queryClient: QueryCacheFacade,
  projectId: string,
  updater: (project: ProjectResponseDto) => ProjectResponseDto,
) {
  queryClient.setQueriesData<ProjectResponseDto[]>({ queryKey: projectKeys.all }, (old) =>
    applyToProjectInList(old, projectId, updater),
  );
  queryClient.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, (old) =>
    old?.map((item) =>
      item.type === 'project' && item.id === projectId
        ? ({ ...updater(item as unknown as ProjectResponseDto), type: 'project' } as FeedItem)
        : item,
    ),
  );
}

function removeProjectFromLists(queryClient: QueryCacheFacade, projectId: string) {
  queryClient.setQueriesData<ProjectResponseDto[]>({ queryKey: projectKeys.all }, (old) =>
    removeProjectFromList(old, projectId),
  );
  queryClient.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, (old) =>
    old?.filter((item) => !(item.type === 'project' && item.id === projectId)),
  );
}

export function useCreateProject() {
  const queryClient = useQueryCache();
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
        status: ProjectStatus.ACTIVE,
        bucket: data.bucket ?? ProjectBucket.ANYTIME,
        scheduledType: data.scheduledType ?? ScheduledType.NONE,
        scheduledDate: data.scheduledDate ?? null,
        dueDate: data.dueDate ?? null,
        completedAt: null,
        trashedAt: null,
        tags: [],
        taskTotalCount: 0,
        taskCompletedCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueriesData<ProjectResponseDto[]>({ queryKey: projectKeys.all }, (old) =>
        old ? [...old, tempProject] : old,
      );
      return { snapshot, tempId };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
    },
    onSuccess: (project, _data, ctx) => {
      // Replace temp item with server-returned real value. 幂等去重：
      // 并发缓存更新（SSE 手术 / engine 写后失效 refetch）可能已写入
      // 真实行——再追加会重复（duplicate key → 卸载重建 → 丢焦）。
      const tempId = ctx?.tempId;
      queryClient.setQueriesData<ProjectResponseDto[]>({ queryKey: projectKeys.all }, (old) => {
        if (!old) return old;
        const deduped = old.filter((p) => p.id !== tempId && p.id !== project.id);
        return [...deduped, project];
      });
      // Set detail cache so detail page can read immediately
      queryClient.setQueryData(projectKeys.detail(project.id), project);
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['review'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectDto }) => updateProject(id, data),
    onMutate: async ({ id, data }) => {
      await cancelProjectLists(queryClient);
      const snapshot = snapshotProjectLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<ProjectResponseDto>(projectKeys.detail(id));
      const now = new Date().toISOString();
      // Trash 中改日期 / 区域 / 标签等即放回（同 projectUpdatePutsBack）
      const putBack = projectUpdatePutsBack(data) ? { trashedAt: null } : {};
      patchProjectInLists(queryClient, id, (project) => ({
        ...project,
        ...data,
        ...putBack,
        updatedAt: now,
      }));
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(id), (old) =>
        old ? { ...old, ...data, ...putBack, updatedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(projectKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, { id }) => {
      refreshAfterWrite(queryClient, { queryKey: projectKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['review'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useRestoreProject() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => restoreProject(id),
    onMutate: async (id) => {
      await cancelProjectLists(queryClient);
      const snapshot = snapshotProjectLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<ProjectResponseDto>(projectKeys.detail(id));
      patchProjectInLists(queryClient, id, (project) => ({
        ...project,
        trashedAt: null,
      }));
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(id), (old) =>
        old ? { ...old, trashedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(projectKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: projectKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['review'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

/** 完成项目的参数：项目 id，或带「剩余任务」处理方式（recurring-projects spec）。 */
export type CompleteProjectVariables =
  string | { id: string; settleRemaining?: SettleRemainingTasks };

const completeVariablesId = (variables: CompleteProjectVariables) =>
  typeof variables === 'string' ? variables : variables.id;

export function useCompleteProject() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (variables: CompleteProjectVariables) =>
      typeof variables === 'string'
        ? completeProject(variables)
        : completeProject(variables.id, { settleRemaining: variables.settleRemaining }),
    onMutate: async (variables) => {
      const id = completeVariablesId(variables);
      await cancelProjectLists(queryClient);
      const snapshot = snapshotProjectLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<ProjectResponseDto>(projectKeys.detail(id));
      const now = new Date().toISOString();
      patchProjectInLists(queryClient, id, (project) => ({
        ...project,
        status: ProjectStatus.COMPLETED,
        completedAt: now,
      }));
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(id), (old) =>
        old ? { ...old, status: ProjectStatus.COMPLETED, completedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(projectKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, variables) => {
      // 剩余任务一并了结、重复项目派生出下一轮：任务列表同样要刷新
      refreshAfterWrite(queryClient, {
        queryKey: projectKeys.detail(completeVariablesId(variables)),
      });
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['review'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['tasks'] });
    },
  });
}

export function useUncompleteProject() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => uncompleteProject(id),
    onMutate: async (id) => {
      await cancelProjectLists(queryClient);
      const snapshot = snapshotProjectLists(queryClient);
      const detailSnapshot = queryClient.getQueryData<ProjectResponseDto>(projectKeys.detail(id));
      patchProjectInLists(queryClient, id, (project) => ({
        ...project,
        status: ProjectStatus.ACTIVE,
        completedAt: null,
      }));
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(id), (old) =>
        old ? { ...old, status: ProjectStatus.ACTIVE, completedAt: null } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(projectKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: projectKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['review'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

/** 重复项目「跳过本次」（recurring-projects spec）；不可跳过时报 RepeatSkipBlockedError。 */
export function useSkipProject() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => skipProject(id),
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: projectKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['review'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
      refreshAfterWrite(queryClient, { queryKey: ['tasks'] });
    },
  });
}

export function useReorderProjects() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderProjects(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      queryClient.setQueriesData<ProjectResponseDto[]>({ queryKey: projectKeys.all }, (old) => {
        if (!old) return old;
        const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
        return [...old].sort((a, b) => {
          const ai = orderMap.get(a.id);
          const bi = orderMap.get(b.id);
          if (ai !== undefined && bi !== undefined) return ai - bi;
          return 0;
        });
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['review'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onMutate: async (id) => {
      await cancelProjectLists(queryClient);
      const snapshot = snapshotProjectLists(queryClient);
      removeProjectFromLists(queryClient, id);
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['review'] });
      refreshAfterWrite(queryClient, { queryKey: ['feed'] });
    },
  });
}

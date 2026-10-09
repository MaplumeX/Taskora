import { isLiveQueryMode, prefetchLiveQuery } from '../engine/live-queries';
import { tasksQueryDefinition } from './useTasks';
import { projectHeadingsQueryDefinition } from './useProjectHeadings';

/** 与项目页共用查询键、过滤和依赖；只预取本地副本，不提前发 REST 请求。 */
export function prefetchProject(projectId: string): void {
  if (!projectId || !isLiveQueryMode()) return;
  prefetchLiveQuery(tasksQueryDefinition({ projectId }));
  prefetchLiveQuery(projectHeadingsQueryDefinition(projectId));
  prefetchLiveQuery(tasksQueryDefinition({ projectId, completed: true }));
  prefetchLiveQuery(projectHeadingsQueryDefinition(projectId, true));
}

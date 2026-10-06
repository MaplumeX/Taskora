import { useMemo } from 'react';

import { effectiveProjectTagIds, effectiveTaskTagIds, tagParentsFrom } from '@taskora/engine';
import type { FeedItem, ProjectResponseDto, TaskResponseDto } from '@taskora/shared';

import { useAreasQuery } from './useAreas';
import { useProjectsQuery } from './useProjects';
import { useTagsQuery } from './useTags';

const ownTagIds = (entity: { tags?: { id: string }[] | null }) =>
  (entity.tags ?? []).map((tag) => tag.id);

export interface EffectiveTags {
  ofTask(task: Pick<TaskResponseDto, 'tags' | 'projectId' | 'areaId'>): string[];
  ofProject(project: Pick<ProjectResponseDto, 'tags' | 'areaId'>): string[];
  ofFeedItem(item: FeedItem): string[];
}

/**
 * 有效 Tag（ADR 0015）：Task 并上所属 Project / Area 的 Tag，Project 并上
 * 所属 Area 的 Tag。继承来源取自 projects / areas 查询；只用于过滤，行上
 * 显示仍用自身 Tag。
 */
export function useEffectiveTags(): EffectiveTags {
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { data: tags = [] } = useTagsQuery();
  return useMemo(() => {
    const parents = tagParentsFrom(
      new Map(projects.map((p) => [p.id, { areaId: p.areaId, tagIds: ownTagIds(p) }])),
      new Map(areas.map((a) => [a.id, { tagIds: ownTagIds(a) }])),
      tags,
    );
    const ofTask: EffectiveTags['ofTask'] = (task) =>
      effectiveTaskTagIds({ ...task, tagIds: ownTagIds(task) }, parents);
    const ofProject: EffectiveTags['ofProject'] = (project) =>
      effectiveProjectTagIds({ ...project, tagIds: ownTagIds(project) }, parents);
    return {
      ofTask,
      ofProject,
      ofFeedItem: (item) => (item.type === 'task' ? ofTask(item) : ofProject(item)),
    };
  }, [projects, areas, tags]);
}

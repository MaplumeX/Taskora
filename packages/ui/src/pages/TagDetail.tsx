import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ProjectStatus } from '@taskora/shared';
import type {
  FeedItem,
  ProjectResponseDto,
  TaskResponseDto,
} from '@taskora/shared';
import { useEffectiveTags, useProjectsQuery, useTagsQuery, useTasksQuery } from '@taskora/api';

import { GroupedFeedListView } from '@/components/feed/GroupedFeedListView';

function taskFeedItem(task: TaskResponseDto): FeedItem {
  return { ...task, type: 'task', tags: task.tags ?? [] };
}

function projectFeedItem(project: ProjectResponseDto): FeedItem {
  return {
    ...project,
    type: 'project',
    // Project 不设 Reminder / Repeat Rule（CONTEXT.md）
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    tags: project.tags ?? [],
  };
}

/**
 * Tag 详情（tags-things3 issue 06）：按有效 Tag（ADR 0015）列出带这个 Tag
 * 的未了结 Project 与任务，按 Area / Project 分组。
 */
export default function TagDetail() {
  const { t } = useTranslation();
  const { tagId } = useParams<{ tagId: string }>();
  const { data: tags = [] } = useTagsQuery();
  const tag = tags.find((it) => it.id === tagId);

  const { data: tasks = [], isLoading, isError } = useTasksQuery({ tagId });
  const { data: projects = [] } = useProjectsQuery();
  const effectiveTags = useEffectiveTags();

  const items = useMemo(() => {
    const tagged = projects.filter(
      (project) =>
        project.status !== ProjectStatus.COMPLETED &&
        project.trashedAt == null &&
        !!tagId &&
        effectiveTags.ofProject(project).includes(tagId),
    );
    return [...tagged.map(projectFeedItem), ...tasks.map(taskFeedItem)];
  }, [projects, tasks, tagId, effectiveTags]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        {tag && (
          <span
            aria-hidden
            className="h-4 w-4 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
        )}
        <h1 className="truncate text-title-1">{tag?.title ?? t('tag:defaultTitle')}</h1>
      </div>

      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <GroupedFeedListView items={items} emptyHint={t('tag:noTasks')} />
      )}
    </div>
  );
}

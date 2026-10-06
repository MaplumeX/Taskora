import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ProjectStatus } from '@taskora/shared';
import type {
  FeedItem,
  ProjectResponseDto,
  TaskResponseDto,
} from '@taskora/shared';
import { useEffectiveTags, useProjectsQuery, useTagsQuery, useTasksQuery } from '@taskora/api';

import { GroupedFeedListView } from '@/components/feed/GroupedFeedListView';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';
import { tagAncestors, tagForest } from '@/components/tags/tagTree';

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
 * 或其任一子孙 Tag（ADR-0016）的未了结 Project 与任务，按 Area / Project
 * 分组。页头带父路径；过滤栏只列本 Tag 的子 Tag，用来收窄。
 */
export default function TagDetail() {
  const { t } = useTranslation();
  const { tagId } = useParams<{ tagId: string }>();
  const { data: tags = [] } = useTagsQuery();
  const tag = tags.find((it) => it.id === tagId);
  const forest = useMemo(() => tagForest(tags), [tags]);
  const ancestors = tagId ? tagAncestors(forest, tagId) : [];

  const { data: tasks = [], isLoading, isError } = useTasksQuery({ tagId });
  const { data: projects = [] } = useProjectsQuery();
  const effectiveTags = useEffectiveTags();

  const items = useMemo(() => {
    const subtree = tagId ? forest.tree.descendantsOf(tagId) : new Set<string>();
    const tagged = projects.filter(
      (project) =>
        project.status !== ProjectStatus.COMPLETED &&
        project.trashedAt == null &&
        effectiveTags.ofProject(project).some((id) => subtree.has(id)),
    );
    return [...tagged.map(projectFeedItem), ...tasks.map(taskFeedItem)];
  }, [projects, tasks, tagId, forest, effectiveTags]);
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem, tagId ?? null);

  return (
    <div className="flex flex-col gap-4">
      {ancestors.length > 0 && (
        <nav
          aria-label={t('tag:parentPath')}
          className="-mb-3 flex flex-wrap items-center gap-1 text-meta text-muted-foreground"
        >
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              <Link to={`/tags/${ancestor.id}`} className="hover:text-foreground hover:underline">
                {ancestor.title}
              </Link>
              <span aria-hidden>›</span>
            </span>
          ))}
        </nav>
      )}
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

      {!isLoading && !isError && <TagFilterBar {...bar} />}

      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <GroupedFeedListView
          items={visible}
          emptyHint={filtering ? t('tag:filterEmpty') : t('tag:noTasks')}
        />
      )}
    </div>
  );
}

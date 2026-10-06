import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  ProjectStatus,
  TaskStatus,
  type ProjectBucket,
  type ProjectResponseDto,
  type TaskResponseDto,
  type TaskSearchHit,
} from '@taskora/shared';
import {
  useAreasQuery,
  useFeedQuery,
  useProjectsQuery,
  useRevealTask,
  useTaskSearchQuery,
} from '@taskora/api';

import { EmptyState } from '@/components/common/EmptyState';
import { QuickFindRow } from '@/components/search/QuickFindRow';
import { SearchTagChips } from '@/components/search/SearchTagChips';
import { buildQuickFindGroups, quickFindRoute } from '@/components/search/quickFindResults';
import { useSearchTagScope } from '@/components/search/useSearchTagScope';
import { TaskListView } from '@/components/task/TaskListView';

/**
 * 搜索页（Quick Find 的「继续搜索」，对齐 Things 3）：扩展范围的结果
 * 在主内容区展示，而不是留在弹窗里。搜索词来自 `?q=`，页头输入框可继续
 * 修改。结果分节：区域与项目（含已了结与 Trash 中的项目）→ 任务（未了结）
 * → 日志（已了结）→ 废纸篓。任务节与日志节是普通任务行，可展开、勾选、
 * 参与键盘 Selection；废纸篓中的任务只读，点击定位到 Trash 页。
 *
 * `?tag=` 是从 Quick Find 带来的 `#tag` chip（可重复，tags-things3-v2 issue
 * 07）：显示在搜索框前，可以删除；有 chip 时搜索词可以为空。
 */
export default function Search() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reveal = useRevealTask();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const tagParam = params.getAll('tag').join(',');
  const tagIds = useMemo(() => (tagParam ? tagParam.split(',') : []), [tagParam]);
  const { tags, inTags } = useSearchTagScope(tagIds);

  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const search = useTaskSearchQuery(query, { extended: true, tagIds });
  const { searchedQuery } = search;
  const hasQuery = searchedQuery.length > 0 || tagIds.length > 0;
  const { data: trashFeed } = useFeedQuery('trash');
  const trashedProjects = useMemo(
    () =>
      (trashFeed ?? []).flatMap((item): ProjectResponseDto[] =>
        item.type === 'project'
          ? [
              {
                ...item,
                status: item.status as ProjectStatus,
                bucket: item.bucket as ProjectBucket,
              },
            ]
          : [],
      ),
    [trashFeed],
  );

  // 新一轮任务结果到达前保留上一轮，避免列表随击键闪烁
  const [hits, setHits] = useState<TaskSearchHit[]>([]);
  useEffect(() => {
    if (!hasQuery) setHits([]);
    else if (search.data) setHits(search.data);
  }, [hasQuery, search.data]);

  const places = useMemo(
    () =>
      buildQuickFindGroups({
        query: searchedQuery,
        lists: [],
        projects,
        areas,
        tags: [],
        hits: [],
        extended: true,
        trashedProjects,
        tagIds,
        inTags,
      }).flatMap((group) => group.items),
    [searchedQuery, projects, areas, trashedProjects, tagIds, inTags],
  );

  // hits 已按相关度排好；分节保持组内顺序
  const { open, settled, trashed } = useMemo(() => {
    const sections = {
      open: [] as TaskResponseDto[],
      settled: [] as TaskResponseDto[],
      trashed: [] as TaskSearchHit[],
    };
    for (const hit of hits) {
      if (hit.task.trashedAt) sections.trashed.push(hit);
      else if (hit.task.status === TaskStatus.ACTIVE) sections.open.push(hit.task);
      else sections.settled.push(hit.task);
    }
    return sections;
  }, [hits]);

  const noResults =
    places.length + open.length + settled.length + trashed.length === 0 && !search.isPending;

  const writeParams = (value: string, nextTags: readonly string[]) =>
    setParams(
      { ...(value ? { q: value } : {}), ...(nextTags.length ? { tag: [...nextTags] } : {}) },
      { replace: true },
    );
  const setQuery = (value: string) => writeParams(value, tagIds);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <SearchIcon aria-hidden className="h-7 w-7 shrink-0 text-muted-foreground" />
        <SearchTagChips
          size="lg"
          tagIds={tagIds}
          tags={tags}
          onRemove={(id) =>
            writeParams(
              query,
              tagIds.filter((tagId) => tagId !== id),
            )
          }
        />
        <input
          type="search"
          aria-label={t('search:pageTitle')}
          placeholder={t('search:pageTitle')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-title-1 outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {(query || tagIds.length > 0) && (
          <button
            type="button"
            aria-label={t('search:clearSearch')}
            onClick={() => writeParams('', [])}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {!hasQuery ? (
        <EmptyState hint={t('search:emptyHint')} />
      ) : search.isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('search:searchFailed')}</p>
      ) : noResults ? (
        <EmptyState hint={t('search:noResults')} />
      ) : (
        <>
          {places.length > 0 && (
            <Section label={t('search:groupPlaces')}>
              {places.map((item) => (
                <div
                  key={item.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => {
                    const route = quickFindRoute(item);
                    if (route) navigate(route);
                  }}
                  onKeyDown={(e) => {
                    const route = quickFindRoute(item);
                    if (e.key === 'Enter' && route) navigate(route);
                  }}
                  className="flex h-10 cursor-pointer items-center rounded-lg px-2 text-body hover:bg-accent/40"
                >
                  <div className="min-w-0 flex-1">
                    <QuickFindRow
                      item={item}
                      query={searchedQuery}
                      projectTitle={(id) => projects.find((p) => p.id === id)?.title}
                      areaTitle={(id) => areas.find((a) => a.id === id)?.title}
                    />
                  </div>
                </div>
              ))}
            </Section>
          )}
          {open.length > 0 && (
            <Section label={t('search:groupTasks')}>
              <TaskListView tasks={open} hideEmptyState selectionRank={1} />
            </Section>
          )}
          {settled.length > 0 && (
            <Section label={t('nav:logbook')}>
              <TaskListView tasks={settled} hideEmptyState selectionRank={2} />
            </Section>
          )}
          {trashed.length > 0 && (
            <Section label={t('nav:trash')}>
              {trashed.map((hit) => (
                <div
                  key={hit.task.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => void reveal(hit.task.id, { allowTrash: true })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void reveal(hit.task.id, { allowTrash: true });
                  }}
                  className="cursor-pointer rounded-lg px-2 py-2.5 text-body hover:bg-accent/40"
                >
                  <QuickFindRow
                    item={{ kind: 'task', id: `task:${hit.task.id}`, hit }}
                    query={searchedQuery}
                    projectTitle={(id) => projects.find((p) => p.id === id)?.title}
                    areaTitle={(id) => areas.find((a) => a.id === id)?.title}
                  />
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col">
      <h2 className="px-2 pb-1 pt-4 text-sm font-medium text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

import type {
  AreaResponseDto,
  ProjectHeadingResponseDto,
  ProjectResponseDto,
  TagResponseDto,
  TaskSearchHit,
} from '@taskora/shared';
import { ProjectStatus } from '@taskora/shared';

import { flatParentOrder } from '@/components/feed/groupedFeedLayout';
import { needleOf, rankByName } from '../../lib/nameMatch';

/**
 * Quick Find 结果推导（`.scratch/quick-find` spec 第 1 节）：纯函数。
 *
 * 导航目标（列表 / 区域与项目 / Heading / 标签）在客户端按名称子串匹配（不区分
 * 大小写），组内名称前缀命中先于包含命中，同档保持视觉顺序（继续搜索
 * 时：未了结 → 已了结 → Trash）；任务组直接
 * 取 searchTasks 的结果（已按相关度排好）。组顺序固定，空组不出现。
 */

/** 内置列表：names[0] 为当前语言名称（显示用），其余为别名（英文名）。 */
export interface QuickFindListTarget {
  to: string;
  names: string[];
}

export type QuickFindItem =
  | { kind: 'list'; id: string; target: QuickFindListTarget }
  | { kind: 'area'; id: string; area: AreaResponseDto }
  | { kind: 'project'; id: string; project: ProjectResponseDto }
  | {
      kind: 'heading';
      id: string;
      heading: ProjectHeadingResponseDto;
      project: ProjectResponseDto;
    }
  | { kind: 'tag'; id: string; tag: TagResponseDto }
  | { kind: 'task'; id: string; hit: TaskSearchHit };

export type QuickFindGroupId = 'lists' | 'places' | 'headings' | 'tags' | 'tasks';

export interface QuickFindGroup {
  id: QuickFindGroupId;
  items: QuickFindItem[];
}

export interface QuickFindInput {
  query: string;
  lists: QuickFindListTarget[];
  /** 侧边栏位次即数组顺序（与 Sidebar 同源）。 */
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
  /**
   * 未归档的 Project Heading（按位次）：所属项目在「区域与项目」组的常规
   * 候选里才出现；同档按项目的侧边栏顺序、再按位次。搜索页不传。
   */
  headings?: ProjectHeadingResponseDto[];
  tags: TagResponseDto[];
  hits: TaskSearchHit[];
  /**
   * 继续搜索：区域与项目组在未了结项目之后纳入已了结项目，再纳入
   * trashedProjects（Trash 中的项目）。
   */
  extended?: boolean;
  trashedProjects?: ProjectResponseDto[];
  /**
   * `#tag` chip（issue 07）：有 chip 时不出现「列表」「Heading」「标签」组，「区域与
   * 项目」组只留下 inTags 判定命中全部 chip 的条目；搜索词可以为空。
   */
  tagIds?: readonly string[];
  inTags?: (entry: PlaceEntry) => boolean;
  /**
   * 已完成项目是否已移入 Logbook（Logging Mode）：尚未移入的与未了结项目
   * 一样出现在常规结果里。缺省按已移入。
   */
  isLogged?: (project: ProjectResponseDto) => boolean;
}

/** 「区域与项目」组的候选。 */
export type PlaceEntry =
  | { kind: 'area'; area: AreaResponseDto }
  | { kind: 'project'; project: ProjectResponseDto };

/** 可作为导航目标的项目：未了结、未进 Trash（含 Later Project）。 */
export function isOpenProject(project: ProjectResponseDto): boolean {
  return project.status === ProjectStatus.ACTIVE && project.trashedAt == null;
}

export function buildQuickFindGroups(input: QuickFindInput): QuickFindGroup[] {
  const needle = needleOf(input.query);
  const tagged = (input.tagIds?.length ?? 0) > 0;
  if (!needle && !tagged) return [];
  /** 有搜索词时按名称排序；只有 chip 时保持视觉顺序。 */
  const byName = <T>(items: T[], namesOf: (item: T) => string[]): T[] =>
    needle ? rankByName(items, namesOf, needle) : items;

  const lists: QuickFindItem[] = tagged
    ? []
    : rankByName(input.lists, (list) => list.names, needle).map((target) => ({
        kind: 'list',
        id: `list:${target.to}`,
        target,
      }));

  const isLogged = input.isLogged ?? (() => true);
  const listed = (project: ProjectResponseDto) =>
    isOpenProject(project) || (project.trashedAt == null && !isLogged(project));
  const listedProjects = input.projects.filter(listed);
  const parents: ReturnType<typeof flatParentOrder> = flatParentOrder(listedProjects, input.areas);
  if (input.extended) {
    const settled = input.projects.filter(
      (project) =>
        project.status !== ProjectStatus.ACTIVE && project.trashedAt == null && !listed(project),
    );
    for (const project of [...settled, ...(input.trashedProjects ?? [])]) {
      parents.push({ kind: 'project', project });
    }
  }
  const inTags = input.inTags;
  const candidates = tagged && inTags ? parents.filter((entry) => inTags(entry)) : parents;
  const places: QuickFindItem[] = byName(candidates, (entry) => [
    entry.kind === 'area' ? entry.area.title : entry.project.title,
  ]).map((entry) =>
    entry.kind === 'area'
      ? { kind: 'area', id: `area:${entry.area.id}`, area: entry.area }
      : { kind: 'project', id: `project:${entry.project.id}`, project: entry.project },
  );

  const projectRank = new Map(listedProjects.map((project, index) => [project.id, index]));
  const headingCandidates = tagged
    ? []
    : (input.headings ?? [])
        .filter((heading) => projectRank.has(heading.projectId))
        .sort((a, b) => projectRank.get(a.projectId)! - projectRank.get(b.projectId)!);
  const headings: QuickFindItem[] = rankByName(
    headingCandidates,
    (heading) => [heading.title],
    needle,
  ).map((heading) => ({
    kind: 'heading',
    id: `heading:${heading.id}`,
    heading,
    project: listedProjects[projectRank.get(heading.projectId)!],
  }));

  const tags: QuickFindItem[] = tagged
    ? []
    : rankByName(input.tags, (tag) => [tag.title], needle).map((tag) => ({
        kind: 'tag',
        id: `tag:${tag.id}`,
        tag,
      }));

  const tasks: QuickFindItem[] = input.hits.map((hit) => ({
    kind: 'task',
    id: `task:${hit.task.id}`,
    hit,
  }));

  const groups: QuickFindGroup[] = [
    { id: 'lists', items: lists },
    { id: 'places', items: places },
    { id: 'headings', items: headings },
    { id: 'tags', items: tags },
    { id: 'tasks', items: tasks },
  ];
  return groups.filter((group) => group.items.length > 0);
}

/** 导航目标的路由；任务返回 null（走 Reveal）。 */
export function quickFindRoute(item: QuickFindItem): string | null {
  switch (item.kind) {
    case 'list':
      return item.target.to;
    case 'area':
      return `/areas/${item.area.id}`;
    case 'project':
      return `/projects/${item.project.id}`;
    case 'heading':
      return `/projects/${item.heading.projectId}`;
    case 'tag':
      return `/tags/${item.tag.id}`;
    case 'task':
      return null;
  }
}

/**
 * 继续搜索：主内容区的搜索页（Things 3 在主窗口列表中展示扩展结果）。
 * Tag 条件（`#tag` chip）以重复的 `tag` 参数带过去。
 */
export function searchRoute(query: string, tagIds: readonly string[] = []): string {
  const parts = [`q=${encodeURIComponent(query)}`];
  for (const id of tagIds) parts.push(`tag=${encodeURIComponent(id)}`);
  return `/search?${parts.join('&')}`;
}

/** 把文本按命中片段切开（不区分大小写，全部命中处）。 */
export function highlightParts(
  text: string,
  query: string,
): Array<{ text: string; match: boolean }> {
  const needle = needleOf(query);
  if (!needle) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

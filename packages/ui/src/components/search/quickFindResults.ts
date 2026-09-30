import type {
  AreaResponseDto,
  ProjectResponseDto,
  TagResponseDto,
  TaskSearchHit,
} from '@taskora/shared';
import { ProjectStatus } from '@taskora/shared';

import { flatParentOrder } from '@/components/feed/groupedFeedLayout';

/**
 * Quick Find 结果推导（`.scratch/quick-find` spec 第 1 节）：纯函数。
 *
 * 导航目标（列表 / 区域与项目 / 标签）在客户端按名称子串匹配（不区分
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
  | { kind: 'tag'; id: string; tag: TagResponseDto }
  | { kind: 'task'; id: string; hit: TaskSearchHit };

export type QuickFindGroupId = 'lists' | 'places' | 'tags' | 'tasks';

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
  tags: TagResponseDto[];
  hits: TaskSearchHit[];
  /**
   * 继续搜索：区域与项目组在未了结项目之后纳入已了结项目，再纳入
   * trashedProjects（Trash 中的项目）。
   */
  extended?: boolean;
  trashedProjects?: ProjectResponseDto[];
}

function needleOf(query: string): string {
  return query.trim().toLowerCase();
}

/** 0：某个名称以搜索词开头；1：包含；null：不命中。 */
function nameRank(names: string[], needle: string): 0 | 1 | null {
  let rank: 0 | 1 | null = null;
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.startsWith(needle)) return 0;
    if (lower.includes(needle)) rank = 1;
  }
  return rank;
}

function rankByName<T>(items: T[], namesOf: (item: T) => string[], needle: string): T[] {
  const ranked: Array<{ item: T; rank: 0 | 1; index: number }> = [];
  items.forEach((item, index) => {
    const rank = nameRank(namesOf(item), needle);
    if (rank !== null) ranked.push({ item, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map(({ item }) => item);
}

/** 可作为导航目标的项目：未了结、未进 Trash（含 Later Project）。 */
function isOpenProject(project: ProjectResponseDto): boolean {
  return project.status === ProjectStatus.ACTIVE && project.trashedAt == null;
}

export function buildQuickFindGroups(input: QuickFindInput): QuickFindGroup[] {
  const needle = needleOf(input.query);
  if (!needle) return [];

  const lists: QuickFindItem[] = rankByName(input.lists, (list) => list.names, needle).map(
    (target) => ({ kind: 'list', id: `list:${target.to}`, target }),
  );

  const parents: ReturnType<typeof flatParentOrder> = flatParentOrder(
    input.projects.filter(isOpenProject),
    input.areas,
  );
  if (input.extended) {
    const settled = input.projects.filter(
      (project) => project.status !== ProjectStatus.ACTIVE && project.trashedAt == null,
    );
    for (const project of [...settled, ...(input.trashedProjects ?? [])]) {
      parents.push({ kind: 'project', project });
    }
  }
  const places: QuickFindItem[] = rankByName(
    parents,
    (entry) => [entry.kind === 'area' ? entry.area.title : entry.project.title],
    needle,
  ).map((entry) =>
    entry.kind === 'area'
      ? { kind: 'area', id: `area:${entry.area.id}`, area: entry.area }
      : { kind: 'project', id: `project:${entry.project.id}`, project: entry.project },
  );

  const tags: QuickFindItem[] = rankByName(input.tags, (tag) => [tag.title], needle).map((tag) => ({
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
    case 'tag':
      return `/tags/${item.tag.id}`;
    case 'task':
      return null;
  }
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

/**
 * 有效 Tag（Effective Tags，ADR 0015）：过滤与查询时，Task 继承所属
 * Project 与 Area 的 Tag，Project 继承所属 Area 的 Tag。纯推导，不写入
 * 字段；行上显示仍只用自身 Tag。
 */

/** 新建 Tag 的默认颜色（与 hub 的 Prisma 列默认值一致）。 */
export const DEFAULT_TAG_COLOR = '#3B82F6';

export interface TagOwnerFields {
  tagIds: readonly string[];
  projectId?: unknown;
  areaId?: unknown;
}

/**
 * 继承来源：按 id 查 Project（含其 areaId）与 Area 的自身 Tag；以及 Tag 树
 * 上的子树（嵌套 Tag，ADR-0016：按 Tag 查询命中它的整棵子树）。
 */
export interface TagParents {
  project(id: string): { areaId: unknown; tagIds: readonly string[] } | undefined;
  area(id: string): { tagIds: readonly string[] } | undefined;
  /** tagId 与它的全部后代；不认识的 Tag 只含自身。 */
  subtreeOf(tagId: string): ReadonlySet<string>;
}

function idOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function areaTagIds(areaId: string | null, parents: TagParents): readonly string[] {
  return areaId ? (parents.area(areaId)?.tagIds ?? []) : [];
}

/** Task 的有效 Tag = 自身 ∪ 所属 Project ∪ 所属 Area（直接归属或经 Project）。 */
export function effectiveTaskTagIds(task: TagOwnerFields, parents: TagParents): string[] {
  const result = new Set(task.tagIds);
  const projectId = idOf(task.projectId);
  const project = projectId ? parents.project(projectId) : undefined;
  if (project) {
    for (const id of project.tagIds) result.add(id);
    for (const id of areaTagIds(idOf(project.areaId), parents)) result.add(id);
  }
  for (const id of areaTagIds(idOf(task.areaId), parents)) result.add(id);
  return [...result];
}

/** Project 的有效 Tag = 自身 ∪ 所属 Area。 */
export function effectiveProjectTagIds(project: TagOwnerFields, parents: TagParents): string[] {
  const result = new Set(project.tagIds);
  for (const id of areaTagIds(idOf(project.areaId), parents)) result.add(id);
  return [...result];
}

/**
 * 由 id → 行的 Map 与全部 Tag 构造 TagParents（各端读出的行形状不同，由
 * 调用方先映射）。
 */
export function tagParentsFrom(
  projects: ReadonlyMap<string, { areaId: unknown; tagIds: readonly string[] }>,
  areas: ReadonlyMap<string, { tagIds: readonly string[] }>,
  tags: readonly TagNodeFields[],
): TagParents {
  const tree = buildTagTree(tags);
  const subtrees = new Map<string, ReadonlySet<string>>();
  return {
    project: (id) => projects.get(id),
    area: (id) => areas.get(id),
    subtreeOf: (tagId) => {
      let subtree = subtrees.get(tagId);
      if (!subtree) {
        subtree = tree.descendantsOf(tagId);
        subtrees.set(tagId, subtree);
      }
      return subtree;
    },
  };
}

/**
 * 条目是否命中 Tag（ADR-0016）：有效 Tag 中有 tagId 或它的任一后代。不展开
 * 祖先：只打了父 Tag 的条目按子 Tag 查不到。
 */
export function tagHit(
  effectiveTagIds: readonly string[],
  tagId: string,
  parents: Pick<TagParents, 'subtreeOf'>,
): boolean {
  const subtree = parents.subtreeOf(tagId);
  return effectiveTagIds.some((id) => subtree.has(id));
}

/**
 * 嵌套 Tag（ADR-0016）：Tag 经 parentId 构成一棵树，层数不限。
 *
 * 字段级 LWW 下两台设备可能并发写出环；hub 合并后会断开（repairEntity），
 * 但修复写传到之前，读取方也必须给出确定、一致的结果：环上 id 最小的
 * Tag 视作顶层。自指与悬空的 parentId（父 Tag 已删除）同样按顶层处理。
 */

export interface TagNodeFields {
  id: string;
  parentId?: unknown;
}

export interface TagTree {
  has(id: string): boolean;
  /** 规范化后的父 id（已断开环、自指与悬空引用）；顶层为 null。 */
  parentOf(id: string): string | null;
  /** 直接子 Tag，保持输入顺序（调用方传入按 Position 排好的列表）；null 取顶层。 */
  childrenOf(id: string | null): string[];
  /** 子树：自身与全部后代。 */
  descendantsOf(id: string): Set<string>;
  /** 祖先，由近到远，不含自身。 */
  ancestorsOf(id: string): string[];
}

export function buildTagTree(tags: readonly TagNodeFields[]): TagTree {
  const ids = new Set(tags.map((tag) => tag.id));
  const raw = new Map<string, string | null>();
  for (const tag of tags) {
    const parent = idOf(tag.parentId);
    raw.set(tag.id, parent && parent !== tag.id && ids.has(parent) ? parent : null);
  }

  // 断环：沿父链走，回到本轮路径上的节点即成环，环上 id 最小的视作顶层
  const cut = new Set<string>();
  const settled = new Set<string>();
  for (const start of raw.keys()) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | null = start;
    while (current !== null && !settled.has(current)) {
      if (onPath.has(current)) {
        const cycle = path.slice(path.indexOf(current));
        cut.add(cycle.reduce((min, id) => (id < min ? id : min)));
        break;
      }
      path.push(current);
      onPath.add(current);
      current = raw.get(current) ?? null;
    }
    for (const id of path) settled.add(id);
  }

  const parent = new Map<string, string | null>();
  const children = new Map<string | null, string[]>();
  for (const tag of tags) {
    if (parent.has(tag.id)) continue;
    const parentId = cut.has(tag.id) ? null : (raw.get(tag.id) ?? null);
    parent.set(tag.id, parentId);
    const siblings = children.get(parentId) ?? [];
    siblings.push(tag.id);
    children.set(parentId, siblings);
  }

  const tree: TagTree = {
    has: (id) => parent.has(id),
    parentOf: (id) => parent.get(id) ?? null,
    childrenOf: (id) => [...(children.get(id) ?? [])],
    descendantsOf: (id) => {
      const result = new Set<string>([id]);
      const queue = [id];
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        for (const child of children.get(next) ?? []) {
          result.add(child);
          queue.push(child);
        }
      }
      return result;
    },
    ancestorsOf: (id) => {
      const result: string[] = [];
      for (let up = tree.parentOf(id); up !== null; up = tree.parentOf(up)) result.push(up);
      return result;
    },
  };
  return tree;
}

/**
 * 把 tagId 的父改为 parentId 是否成环（含自指）。parentOf 返回现有父
 * id；未知的 Tag 返回 undefined / null。现有数据里已有的环不会让它死循环。
 */
export function tagParentCreatesCycle(
  tagId: string,
  parentId: string | null,
  parentOf: (id: string) => string | null | undefined,
): boolean {
  const seen = new Set<string>();
  for (let up = parentId; up != null && !seen.has(up); up = parentOf(up) ?? null) {
    if (up === tagId) return true;
    seen.add(up);
  }
  return false;
}

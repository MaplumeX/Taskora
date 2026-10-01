/**
 * 有效 Tag（Effective Tags，ADR 0015）：过滤与查询时，Task 继承所属
 * Project 与 Area 的 Tag，Project 继承所属 Area 的 Tag。纯推导，不写入
 * 字段；行上显示仍只用自身 Tag。
 */

export interface TagOwnerFields {
  tagIds: readonly string[];
  projectId?: unknown;
  areaId?: unknown;
}

/** 继承来源：按 id 查 Project（含其 areaId）与 Area 的自身 Tag。 */
export interface TagParents {
  project(id: string): { areaId: unknown; tagIds: readonly string[] } | undefined;
  area(id: string): { tagIds: readonly string[] } | undefined;
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

/** 由 id → 行的 Map 构造 TagParents（各端读出的行形状不同，由调用方先映射）。 */
export function tagParentsFrom(
  projects: ReadonlyMap<string, { areaId: unknown; tagIds: readonly string[] }>,
  areas: ReadonlyMap<string, { tagIds: readonly string[] }>,
): TagParents {
  return { project: (id) => projects.get(id), area: (id) => areas.get(id) };
}

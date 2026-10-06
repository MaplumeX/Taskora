import type { TagResponseDto } from '@taskora/shared';

import { tagForest, type TagForest } from './tagTree';

/**
 * 列表 Tag 过滤（`.scratch/tags-things3` issue 05，嵌套 Tag 见
 * `.scratch/tags-things3-v2` issue 04）：按有效 Tag（ADR 0015）判定，选中
 * 一个 Tag 即命中它的整棵子树（ADR-0016）。选中路径从顶层（或 root 的
 * 子 Tag）往下，当前过滤是最深的那一个；选中的 Tag 有出现在列表里的子
 * Tag 时，过滤栏再多出一行，用来继续收窄。
 */
export type TagFilter = { kind: 'tag'; path: string[] } | { kind: 'untagged' };

export interface TagFilterOptions {
  forest: TagForest;
  /** 第一行的父节点：null 为顶层；Tag 详情页传当前 Tag，只列它的子 Tag。 */
  root: string | null;
  /** 自身或任一后代出现在列表条目有效 Tag 里的 Tag。 */
  shown: ReadonlySet<string>;
  /** 列表中有没有任何有效 Tag 的条目（Tag 详情页不提供「无标签」）。 */
  untagged: boolean;
}

/**
 * 从当前列表各条目的有效 Tag 收集过滤选项；第一行一个可选的 Tag 都没有时
 * 为 null（不显示过滤栏）。
 */
export function collectFilterOptions(
  effective: readonly (readonly string[])[],
  tags: readonly TagResponseDto[],
  root: string | null = null,
): TagFilterOptions | null {
  const forest = tagForest(tags);
  const shown = new Set<string>();
  for (const id of new Set(effective.flat())) {
    if (!forest.tree.has(id)) continue;
    shown.add(id);
    for (const ancestor of forest.tree.ancestorsOf(id)) shown.add(ancestor);
  }
  const options: TagFilterOptions = {
    forest,
    root,
    shown,
    untagged: root === null && effective.some((ids) => ids.length === 0),
  };
  return filterLevels(options, []).length > 0 ? options : null;
}

/** 过滤栏的各行：第一行是 root 的子 Tag，之后每一行是路径上那个 Tag 的子 Tag。 */
export function filterLevels(
  options: TagFilterOptions,
  path: readonly string[],
): TagResponseDto[][] {
  const levels: TagResponseDto[][] = [];
  const parents = [options.root, ...path];
  for (const parent of parents) {
    const level = options.forest.tree
      .childrenOf(parent)
      .filter((id) => options.shown.has(id))
      .flatMap((id) => {
        const tag = options.forest.byId.get(id);
        return tag ? [tag] : [];
      });
    if (level.length === 0) break;
    levels.push(level);
  }
  return levels;
}

/** 点了第 level 行的某个 Tag 之后的过滤；再点已选中的 Tag 即退回上一层。 */
export function toggleFilterTag(
  filter: TagFilter | null,
  level: number,
  tagId: string,
): TagFilter | null {
  const path = filter?.kind === 'tag' ? filter.path.slice(0, level) : [];
  const selected = filter?.kind === 'tag' && filter.path[level] === tagId;
  const next = selected ? path : [...path, tagId];
  return next.length > 0 ? { kind: 'tag', path: next } : null;
}

/** 条目是否命中过滤：有效 Tag 落在选中 Tag 的子树里。 */
export function matchesTagFilter(
  effective: readonly string[],
  filter: TagFilter,
  forest: TagForest,
): boolean {
  if (filter.kind === 'untagged') return effective.length === 0;
  const active = filter.path[filter.path.length - 1];
  if (active === undefined) return true;
  const subtree = forest.tree.descendantsOf(active);
  return effective.some((id) => subtree.has(id));
}

/** 过滤是否仍对应当前选项（路径上的 Tag 不再出现在列表里、或层级变了时视为失效）。 */
export function filterInOptions(filter: TagFilter, options: TagFilterOptions | null): boolean {
  if (!options) return false;
  if (filter.kind === 'untagged') return options.untagged;
  let parent = options.root;
  for (const id of filter.path) {
    if (!options.shown.has(id) || options.forest.tree.parentOf(id) !== parent) return false;
    parent = id;
  }
  return filter.path.length > 0;
}

import type { TagResponseDto } from '@taskora/shared';

import { flattenTagTree, tagAncestors, tagForest } from '@/components/tags/tagTree';
import { needleOf, rankByName } from '../../../lib/nameMatch';

/**
 * Tag Picker 的行：Tag（depth 为树中层级，path 为祖先标题、由远到近）、
 * 「新建『xxx』」。
 */
export type TagPickerRow =
  | { kind: 'tag'; id: string; tag: TagResponseDto; depth: number; path: string[] }
  | { kind: 'create'; id: 'create'; title: string };

/**
 * 无搜索词：按 Tag 树先序排列、逐层缩进（嵌套 Tag，ADR-0016），同级保持
 * tags 的列表顺序。有搜索词：扁平结果，前缀命中先于包含命中，带父路径
 * 区分同名 Tag；与已有 Tag 不重名（去首尾空白、不区分大小写）时末尾追加
 * 新建项。
 */
export function buildTagPickerRows({
  tags,
  query,
}: {
  tags: TagResponseDto[];
  query: string;
}): TagPickerRow[] {
  const forest = tagForest(tags);
  const needle = needleOf(query);
  if (needle) {
    const rows: TagPickerRow[] = rankByName(tags, (tag) => [tag.title], needle).map((tag) => ({
      kind: 'tag',
      id: tag.id,
      tag,
      depth: 0,
      path: tagAncestors(forest, tag.id).map((ancestor) => ancestor.title),
    }));
    if (!tags.some((tag) => needleOf(tag.title) === needle)) {
      rows.push({ kind: 'create', id: 'create', title: query.trim() });
    }
    return rows;
  }
  return flattenTagTree(forest).map(({ tag, depth }) => ({
    kind: 'tag',
    id: tag.id,
    tag,
    depth,
    path: [],
  }));
}

/** 一个 Tag 在被编辑对象（一个或多个）上的状态：全部有 / 部分有 / 都没有。 */
export type TagSelectionState = 'all' | 'some' | 'none';

export function tagSelectionState(
  items: readonly { tagIds: readonly string[] }[],
  tagId: string,
): TagSelectionState {
  const count = items.filter((item) => item.tagIds.includes(tagId)).length;
  if (count === 0) return 'none';
  return count === items.length ? 'all' : 'some';
}

/**
 * 切换一个 Tag：全部都有时从每一项去掉，否则给每一项加上。每项在自己
 * 的原值上增减，不覆盖其它 Tag；只返回实际变化的项。
 */
export function toggleTagAcross<T extends { id: string; tagIds: readonly string[] }>(
  items: readonly T[],
  tagId: string,
): Array<{ id: string; tagIds: string[] }> {
  const remove = tagSelectionState(items, tagId) === 'all';
  const changes: Array<{ id: string; tagIds: string[] }> = [];
  for (const item of items) {
    const has = item.tagIds.includes(tagId);
    if (remove && has) {
      changes.push({ id: item.id, tagIds: item.tagIds.filter((id) => id !== tagId) });
    } else if (!remove && !has) {
      changes.push({ id: item.id, tagIds: [...item.tagIds, tagId] });
    }
  }
  return changes;
}

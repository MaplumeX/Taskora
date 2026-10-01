import type { TagResponseDto } from '@taskora/shared';

import { needleOf, rankByName } from '../../../lib/nameMatch';

/** Tag Picker 的行：Group 小标题（不可选）、Tag、「新建『xxx』」。 */
export type TagPickerRow =
  | { kind: 'header'; id: string; title: string }
  | { kind: 'tag'; id: string; tag: TagResponseDto }
  | { kind: 'create'; id: 'create'; title: string };

export type SelectableTagRow = Exclude<TagPickerRow, { kind: 'header' }>;

interface GroupLike {
  id: string;
  title: string;
}

/**
 * 无搜索词：按 Group 分小节（Group 顺序同 Tags 页），未分组的 Tag 放最后，
 * 组内保持 tags 的列表顺序。有搜索词：扁平结果，前缀命中先于包含命中；
 * 与已有 Tag 不重名（去首尾空白、不区分大小写）时末尾追加新建项。
 */
export function buildTagPickerRows({
  tags,
  groups,
  query,
}: {
  tags: TagResponseDto[];
  groups: GroupLike[];
  query: string;
}): TagPickerRow[] {
  const needle = needleOf(query);
  if (needle) {
    const rows: TagPickerRow[] = rankByName(tags, (tag) => [tag.title], needle).map((tag) => ({
      kind: 'tag',
      id: tag.id,
      tag,
    }));
    if (!tags.some((tag) => needleOf(tag.title) === needle)) {
      rows.push({ kind: 'create', id: 'create', title: query.trim() });
    }
    return rows;
  }

  const groupIds = new Set(groups.map((group) => group.id));
  const rows: TagPickerRow[] = [];
  for (const group of groups) {
    const members = tags.filter((tag) => tag.tagGroupId === group.id);
    if (members.length === 0) continue;
    rows.push({ kind: 'header', id: `group-${group.id}`, title: group.title });
    for (const tag of members) rows.push({ kind: 'tag', id: tag.id, tag });
  }
  for (const tag of tags) {
    if (!tag.tagGroupId || !groupIds.has(tag.tagGroupId))
      rows.push({ kind: 'tag', id: tag.id, tag });
  }
  return rows;
}

export function selectableRows(rows: TagPickerRow[]): SelectableTagRow[] {
  return rows.filter((row): row is SelectableTagRow => row.kind !== 'header');
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

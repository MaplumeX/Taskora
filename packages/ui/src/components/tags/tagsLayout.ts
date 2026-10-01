import { arrayMove } from '@dnd-kit/sortable';

import type { TagResponseDto } from '@taskora/shared';

/**
 * Tags 管理页的大纲（tags-things3 issue 07）：扁平行序列——每个 Group 小标题
 * 后跟其成员 Tag，最后是固定的「未分组」小标题与未分组 Tag。拖拽在这条
 * 扁平序列上进行，落点决定 Tag 的新 Group 与新顺序、Group 的新顺序。
 */
export const UNGROUPED_ROW_ID = 'ungrouped';

export type TagsRow =
  | { kind: 'group'; id: string; groupId: string; title: string }
  | { kind: 'tag'; id: string; tag: TagResponseDto }
  | { kind: 'ungrouped'; id: typeof UNGROUPED_ROW_ID };

interface GroupLike {
  id: string;
  title: string;
}

export const groupRowId = (groupId: string) => `group:${groupId}`;
export const tagRowId = (tagId: string) => `tag:${tagId}`;

export function buildTagsRows(tags: TagResponseDto[], groups: GroupLike[]): TagsRow[] {
  const groupIds = new Set(groups.map((group) => group.id));
  const rows: TagsRow[] = [];
  for (const group of groups) {
    rows.push({ kind: 'group', id: groupRowId(group.id), groupId: group.id, title: group.title });
    for (const tag of tags) {
      if (tag.tagGroupId === group.id) rows.push({ kind: 'tag', id: tagRowId(tag.id), tag });
    }
  }
  rows.push({ kind: 'ungrouped', id: UNGROUPED_ROW_ID });
  for (const tag of tags) {
    if (!tag.tagGroupId || !groupIds.has(tag.tagGroupId)) {
      rows.push({ kind: 'tag', id: tagRowId(tag.id), tag });
    }
  }
  return rows;
}

export type TagsDrop =
  | {
      kind: 'tag';
      tagId: string;
      /** 新的所属 Group；与原值相同则为 undefined。 */
      groupChange?: string | null;
      /** 全部 Tag 的新顺序（Group 顺序 → 组内顺序 → 未分组）。 */
      tagOrder: string[];
    }
  | { kind: 'group'; groupOrder: string[] };

/** 行所在的 Group（Group 小标题行即自身；未分组区为 null）。 */
function owningGroup(rows: TagsRow[], index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const row = rows[i];
    if (row.kind === 'group') return row.groupId;
    if (row.kind === 'ungrouped') return null;
  }
  return null;
}

/** 拖放结果；没有变化时为 null。 */
export function resolveTagsDrop(
  rows: TagsRow[],
  activeId: string,
  overId: string,
): TagsDrop | null {
  if (activeId === overId) return null;
  const from = rows.findIndex((row) => row.id === activeId);
  const to = rows.findIndex((row) => row.id === overId);
  if (from === -1 || to === -1) return null;
  const active = rows[from];

  if (active.kind === 'tag') {
    // 首行总是小标题：Tag 不能落到它上方
    const moved = arrayMove(rows, from, Math.max(to, 1));
    const index = moved.findIndex((row) => row.id === activeId);
    const groupId = owningGroup(moved, index - 1);
    const tagOrder = moved.flatMap((row) => (row.kind === 'tag' ? [row.tag.id] : []));
    const before = rows.flatMap((row) => (row.kind === 'tag' ? [row.tag.id] : []));
    const previousGroup = active.tag.tagGroupId ?? null;
    const groupChange = groupId === previousGroup ? undefined : groupId;
    if (groupChange === undefined && tagOrder.every((id, i) => id === before[i])) return null;
    return { kind: 'tag', tagId: active.tag.id, groupChange, tagOrder };
  }

  if (active.kind === 'group') {
    const groupOrder = rows.flatMap((row) => (row.kind === 'group' ? [row.groupId] : []));
    const fromGroup = groupOrder.indexOf(active.groupId);
    // 落点所在的 Group；落在未分组区即移到最后
    const target = owningGroup(rows, to);
    const toGroup = target === null ? groupOrder.length - 1 : groupOrder.indexOf(target);
    if (fromGroup === toGroup) return null;
    return { kind: 'group', groupOrder: arrayMove(groupOrder, fromGroup, toGroup) };
  }

  return null;
}

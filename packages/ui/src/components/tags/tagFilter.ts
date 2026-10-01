import type { TagResponseDto } from '@taskora/shared';

/**
 * 列表 Tag 过滤（`.scratch/tags-things3` issue 05）：按有效 Tag（ADR 0015）
 * 判定。Tag Group 视作父节点：选中 Group 命中其下任一 Tag，可再收窄到
 * 组内单个 Tag。
 */
export type TagFilter =
  | { kind: 'tag'; tagId: string }
  | { kind: 'group'; groupId: string; tagId: string | null }
  | { kind: 'untagged' };

interface GroupLike {
  id: string;
  title: string;
}

export interface TagFilterOptions {
  /** 当前列表中至少出现一个成员的 Group（按 Group 顺序），带出现的成员。 */
  groups: Array<{ id: string; title: string; tags: TagResponseDto[] }>;
  /** 当前列表中出现的未分组 Tag（按 tags 顺序）。 */
  tags: TagResponseDto[];
  /** 列表中有没有任何有效 Tag 的条目。 */
  untagged: boolean;
}

/** 从当前列表各条目的有效 Tag 收集过滤选项；一个 Tag 都没出现时为 null（不显示过滤栏）。 */
export function collectFilterOptions(
  effective: readonly (readonly string[])[],
  tags: readonly TagResponseDto[],
  groups: readonly GroupLike[],
): TagFilterOptions | null {
  const present = new Set(effective.flat());
  const shown = tags.filter((tag) => present.has(tag.id));
  if (shown.length === 0) return null;
  const groupIds = new Set(groups.map((group) => group.id));
  return {
    groups: groups
      .map((group) => ({
        id: group.id,
        title: group.title,
        tags: shown.filter((tag) => tag.tagGroupId === group.id),
      }))
      .filter((group) => group.tags.length > 0),
    tags: shown.filter((tag) => !tag.tagGroupId || !groupIds.has(tag.tagGroupId)),
    untagged: effective.some((ids) => ids.length === 0),
  };
}

export function matchesTagFilter(
  effective: readonly string[],
  filter: TagFilter,
  tags: readonly TagResponseDto[],
): boolean {
  switch (filter.kind) {
    case 'untagged':
      return effective.length === 0;
    case 'tag':
      return effective.includes(filter.tagId);
    case 'group':
      if (filter.tagId) return effective.includes(filter.tagId);
      return tags.some((tag) => tag.tagGroupId === filter.groupId && effective.includes(tag.id));
  }
}

/** 过滤是否仍对应当前选项（选中的 Tag / Group 已不在列表里时视为失效）。 */
export function filterInOptions(filter: TagFilter, options: TagFilterOptions | null): boolean {
  if (!options) return false;
  switch (filter.kind) {
    case 'untagged':
      return options.untagged;
    case 'tag':
      return options.tags.some((tag) => tag.id === filter.tagId);
    case 'group': {
      const group = options.groups.find((g) => g.id === filter.groupId);
      return !!group && (!filter.tagId || group.tags.some((tag) => tag.id === filter.tagId));
    }
  }
}

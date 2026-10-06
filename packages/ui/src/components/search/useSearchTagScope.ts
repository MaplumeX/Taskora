import { useCallback, useMemo } from 'react';

import { useEffectiveTags, useTagsQuery } from '@taskora/api';

import { tagForest } from '@/components/tags/tagTree';
import type { PlaceEntry } from './quickFindResults';

/**
 * `#tag` chip 对「区域与项目」组的判定（tags-things3-v2 issue 07）：Project
 * 看有效 Tag（并上所属 Area 的 Tag），Area 看自身 Tag；每个 chip 按子树命中
 * （ADR 0015 / 0016），chip 之间是 AND。与任务搜索的 Tag 条件同一口径。
 */
export function useSearchTagScope(tagIds: readonly string[]) {
  const { data: tags = [] } = useTagsQuery();
  const effectiveTags = useEffectiveTags();
  const forest = useMemo(() => tagForest(tags), [tags]);
  const inTags = useCallback(
    (entry: PlaceEntry) => {
      const effective =
        entry.kind === 'project'
          ? effectiveTags.ofProject(entry.project)
          : (entry.area.tags ?? []).map((tag) => tag.id);
      return tagIds.every((tagId) => {
        const subtree = forest.tree.descendantsOf(tagId);
        return effective.some((id) => subtree.has(id));
      });
    },
    [tagIds, effectiveTags, forest],
  );
  return { tags, inTags };
}

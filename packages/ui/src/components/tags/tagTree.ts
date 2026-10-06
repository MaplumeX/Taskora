import { buildTagTree, type TagTree } from '@taskora/api';
import type { TagResponseDto } from '@taskora/shared';

/**
 * 嵌套 Tag 的树（ADR-0016）：选择器、过滤栏、详情页与管理页共用。tags 需按
 * Position 排好（useTagsQuery 的顺序），同级保持这个顺序。
 */
export interface TagForest {
  tree: TagTree;
  byId: Map<string, TagResponseDto>;
}

export function tagForest(tags: readonly TagResponseDto[]): TagForest {
  return {
    tree: buildTagTree(tags),
    byId: new Map(tags.map((tag) => [tag.id, tag])),
  };
}

export interface FlatTag {
  tag: TagResponseDto;
  depth: number;
  hasChildren: boolean;
}

/** 先序遍历；collapsed 里的 Tag 不展开其子树。 */
export function flattenTagTree(forest: TagForest, collapsed?: ReadonlySet<string>): FlatTag[] {
  const rows: FlatTag[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const id of forest.tree.childrenOf(parentId)) {
      const tag = forest.byId.get(id);
      if (!tag) continue;
      const hasChildren = forest.tree.childrenOf(id).length > 0;
      rows.push({ tag, depth, hasChildren });
      if (hasChildren && !collapsed?.has(id)) visit(id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

/** 祖先 Tag，由远到近（页头路径、搜索结果里的父路径）。 */
export function tagAncestors(forest: TagForest, id: string): TagResponseDto[] {
  return forest.tree
    .ancestorsOf(id)
    .reverse()
    .flatMap((ancestorId) => {
      const tag = forest.byId.get(ancestorId);
      return tag ? [tag] : [];
    });
}

import type { TagResponseDto } from '@taskora/shared';

import { flattenTagTree, type TagForest } from './tagTree';

/**
 * Tags 管理页的大纲（tags-things3-v2 issue 05）：Tag 树按先序排成扁平行，
 * 折叠的 Tag 不展开子树。
 *
 * 拖拽沿用 `lib/dnd.ts` 的「让位」约定，按大纲编辑器的方式决定层级：
 * - 拖起时被拖 Tag 的子树先收起（dragRows），连同它一起移动；
 * - 上下：指针越过某行中线即把空位挪到它前 / 后（moveRow），列表实时重排；
 * - 左右：横向位移每满一档缩进加 / 减一层（projectDepth），范围受上下两行
 *   限制——最深是上一行的子 Tag，最浅不能浅过下一行（否则下一行会改父）；
 * - 松手时由空位所在位置与层级换算出新父 Tag 与同级位置（resolveTreeDrop）。
 * 「移到…」把 Tag 挂到选定父 Tag 的末尾（resolveTagsMove）。结果统一成
 * 「改父 + 全部 Tag 的新先序」：先序即全局 Position 顺序，同级顺序随之确定。
 */
export interface TagsRow {
  id: string;
  tag: TagResponseDto;
  depth: number;
  hasChildren: boolean;
}

/** 指针在目标行的上半 / 下半：空位放到它前 / 后。 */
export type RowEdge = 'before' | 'after';

export interface TagsDrop {
  tagId: string;
  /** 新的父 Tag；与原值相同则为 undefined。 */
  parentChange?: string | null;
  /** 全部 Tag 的新先序（写 Position 用）。 */
  tagOrder: string[];
}

export const tagRowId = (tagId: string) => `tag:${tagId}`;
export const tagIdOfRow = (rowId: string) => rowId.slice('tag:'.length);

export function buildTagsRows(forest: TagForest, collapsed?: ReadonlySet<string>): TagsRow[] {
  return flattenTagTree(forest, collapsed).map(({ tag, depth, hasChildren }) => ({
    id: tagRowId(tag.id),
    tag,
    depth,
    hasChildren,
  }));
}

/** 能否把 tagId 挂到 parentId 下（不能挂到自己或自己的后代下面）。 */
export function canNestUnder(forest: TagForest, tagId: string, parentId: string | null): boolean {
  return parentId === null || !forest.tree.descendantsOf(tagId).has(parentId);
}

function preorder(children: (id: string | null) => string[]): string[] {
  const order: string[] = [];
  const visit = (parentId: string | null) => {
    for (const id of children(parentId)) {
      order.push(id);
      visit(id);
    }
  };
  visit(null);
  return order;
}

/** 把 tagId 移到 parentId 下、排在新同级中的 index 处；不合法或没有变化时为 null。 */
function applyMove(
  forest: TagForest,
  tagId: string,
  parentId: string | null,
  index: number,
): TagsDrop | null {
  if (!forest.tree.has(tagId) || !canNestUnder(forest, tagId, parentId)) return null;
  const siblings = forest.tree.childrenOf(parentId).filter((id) => id !== tagId);
  siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, tagId);
  const children = (id: string | null) =>
    id === parentId ? siblings : forest.tree.childrenOf(id).filter((child) => child !== tagId);

  const before = preorder((id) => forest.tree.childrenOf(id));
  const tagOrder = preorder(children);
  const parentChange = parentId === forest.tree.parentOf(tagId) ? undefined : parentId;
  if (parentChange === undefined && tagOrder.every((id, i) => id === before[i])) return null;
  return { tagId, parentChange, tagOrder };
}

/** 拖起时的行：去掉被拖 Tag 的子树（它们跟着被拖 Tag 一起移动）。 */
export function dragRows(rows: TagsRow[], activeTagId: string): TagsRow[] {
  const at = rows.findIndex((row) => row.tag.id === activeTagId);
  if (at === -1) return rows;
  let end = at + 1;
  while (end < rows.length && rows[end].depth > rows[at].depth) end += 1;
  return [...rows.slice(0, at + 1), ...rows.slice(end)];
}

/** 把被拖行挪到目标行前 / 后；没有变化时为 null。 */
export function moveRow(
  rows: TagsRow[],
  activeTagId: string,
  overTagId: string,
  edge: RowEdge,
): TagsRow[] | null {
  if (activeTagId === overTagId) return null;
  const from = rows.findIndex((row) => row.tag.id === activeTagId);
  if (from === -1) return null;
  const rest = rows.filter((row) => row.tag.id !== activeTagId);
  const over = rest.findIndex((row) => row.tag.id === overTagId);
  if (over === -1) return null;
  const to = edge === 'before' ? over : over + 1;
  if (to === from) return null;
  return [...rest.slice(0, to), rows[from], ...rest.slice(to)];
}

/** 被拖行在当前位置可取的层级：[下一行的层级, 上一行的层级 + 1]。 */
export function depthRange(rows: TagsRow[], activeTagId: string): { min: number; max: number } {
  const at = rows.findIndex((row) => row.tag.id === activeTagId);
  const previous = rows[at - 1];
  const next = rows[at + 1];
  const max = previous ? previous.depth + 1 : 0;
  const min = next ? Math.min(next.depth, max) : 0;
  return { min, max };
}

/** 横向位移换算层级：从拖起时的层级出发，每满一档缩进加 / 减一层，再夹到可取范围。 */
export function projectDepth(
  rows: TagsRow[],
  activeTagId: string,
  startDepth: number,
  offsetX: number,
  indentPx: number,
): number {
  const { min, max } = depthRange(rows, activeTagId);
  const wanted = startDepth + Math.round(offsetX / indentPx);
  return Math.max(min, Math.min(max, wanted));
}

/**
 * 松手：空位所在位置与层级 → 新父 Tag（往上找第一行层级比它浅一层的）与
 * 在新同级中的位置。不合法或没有变化时为 null。
 */
export function resolveTreeDrop(
  forest: TagForest,
  rows: TagsRow[],
  activeTagId: string,
  depth: number,
): TagsDrop | null {
  const at = rows.findIndex((row) => row.tag.id === activeTagId);
  if (at === -1) return null;
  let parentId: string | null = null;
  let index = 0;
  for (let i = at - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.depth === depth) index += 1;
    if (row.depth < depth) {
      parentId = row.tag.id;
      break;
    }
  }
  return applyMove(forest, activeTagId, parentId, index);
}

/** 「移到…」：挂到 parentId（null 为顶层）的末尾。 */
export function resolveTagsMove(
  forest: TagForest,
  tagId: string,
  parentId: string | null,
): TagsDrop | null {
  if (parentId === forest.tree.parentOf(tagId)) return null;
  const end = forest.tree.childrenOf(parentId).filter((id) => id !== tagId).length;
  return applyMove(forest, tagId, parentId, end);
}

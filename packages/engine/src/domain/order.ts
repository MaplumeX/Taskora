/**
 * 列表顺序（ADR-0007 Position）：web（REST）与设备副本读同一个顺序。
 */

import { positionBetween, repositionMinimal } from '../position';

export interface Positioned {
  id?: string;
  position?: string | null;
}

/**
 * 行的排序键：Position。为空只是防御（协议 4 起新建总带 Position，hub 启动
 * 时已物化存量的空值），排在最前，不让一行坏数据击穿排序。
 */
export function effectivePosition(row: Positioned): string {
  return typeof row.position === 'string' ? row.position : '';
}

/** 可作为插入邻居的 Position（空值不能参与 positionBetween）。 */
function neighborKey(row: Positioned | undefined): string | null {
  return row && typeof row.position === 'string' ? row.position : null;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** feed 混排中的行：项目可带 Feed Position。 */
export interface FeedPositioned extends Positioned {
  feedPosition?: string | null;
}

/**
 * feed 视图中的排序键：任务与项目行混排在同一个键空间里。任务用自身
 * Position；项目用 Feed Position（在 feed 中拖动过才有），没有时退回其
 * Position——项目的 Position 只表达侧边栏顺序，从未在 feed 中排过的项目
 * 维持既有的混排结果。
 */
export function feedSortKey(row: FeedPositioned): string {
  return typeof row.feedPosition === 'string' ? row.feedPosition : effectivePosition(row);
}

/**
 * 按有效 Position 排序（字节序，与设备 SQLite 的 BINARY 排序一致；
 * Postgres ORDER BY 用数据库排序规则，不能代替）。平局按 id，两端稳定。
 */
export function sortByEffectivePosition<T extends Positioned>(rows: readonly T[]): T[] {
  const keyed = rows.map((row) => ({ row, key: effectivePosition(row) }));
  keyed.sort(
    (a, b) => compareStrings(a.key, b.key) || compareStrings(a.row.id ?? '', b.row.id ?? ''),
  );
  return keyed.map(({ row }) => row);
}

/** 排在全部行之后的 Position（新建追加到末尾）。 */
export function positionAtEnd(rows: readonly Positioned[]): string {
  const sorted = sortByEffectivePosition(rows);
  return positionBetween(neighborKey(sorted[sorted.length - 1]), null);
}

/** 排在全部行之前的 Position（新建置顶）。 */
export function positionAtStart(rows: readonly Positioned[]): string {
  const sorted = sortByEffectivePosition(rows);
  return positionBetween(null, neighborKey(sorted.find((row) => neighborKey(row) !== null)));
}

/**
 * 紧接在 afterId 之后的 Position；afterId 不在 rows 里时追加到末尾。
 */
export function positionAfterRow(rows: readonly Positioned[], afterId: string): string {
  const sorted = sortByEffectivePosition(rows);
  const index = sorted.findIndex((row) => row.id === afterId);
  if (index === -1) return positionAtEnd(rows);
  return positionBetween(neighborKey(sorted[index]), neighborKey(sorted[index + 1]));
}

/**
 * 按目标顺序重排（orderedIds 中不在 rows 里的 id 忽略）：只给必须移动的
 * 行分配新 Position（repositionMinimal）。只返回有变化的行。
 */
export function planReorder(
  rows: ReadonlyArray<Positioned & { id: string }>,
  orderedIds: readonly string[],
): Array<{ id: string; patch: { position: string } }> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return repositionMinimal(
    orderedIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [{ id, position: neighborKey(row) }] : [];
    }),
  ).map(({ id, position }) => ({ id, patch: { position } }));
}

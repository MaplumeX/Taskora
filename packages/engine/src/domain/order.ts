/**
 * 列表顺序（ADR-0007 Position）：web（REST）与设备副本读同一个顺序。
 */

import { synthPosition } from '../position';
import { instantMs } from './calendar';

export interface Positioned {
  id?: string;
  position?: string | null;
  sortOrder?: number | null;
  createdAt?: Date | string | null;
}

/**
 * 行的有效 Position：真实 position；缺省（legacy / REST 新建）时按
 * sortOrder + createdAt 合成——与 hub 下发给设备的合成口径一致。
 */
export function effectivePosition(row: Positioned): string {
  if (typeof row.position === 'string') return row.position;
  const createdMs = instantMs(row.createdAt) ?? 0;
  return synthPosition(typeof row.sortOrder === 'number' ? row.sortOrder : 0, new Date(createdMs));
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

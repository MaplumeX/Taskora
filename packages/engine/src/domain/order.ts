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

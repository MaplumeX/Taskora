import { synthPosition } from '@taskora/engine';

interface Positioned {
  position?: string | null;
  sortOrder?: number | null;
  createdAt?: Date | string | null;
}

/**
 * 行的有效 Position：真实 position，缺省（legacy / REST 新建）时按
 * sortOrder + createdAt 合成——与 hub 下发给设备的合成口径一致
 * （entity-codec.wireViewOfRow），web 与桌面端因此读同一个顺序。
 */
export function effectivePosition(row: Positioned): string {
  if (typeof row.position === 'string') return row.position;
  const createdAt = row.createdAt ? new Date(row.createdAt) : new Date(0);
  return synthPosition(
    typeof row.sortOrder === 'number' ? row.sortOrder : 0,
    Number.isNaN(createdAt.getTime()) ? new Date(0) : createdAt,
  );
}

/**
 * 按有效 Position 排序（字节序，与设备 SQLite 的 BINARY 排序一致）。
 * 不能交给 Postgres ORDER BY：position 列用数据库默认排序规则，与
 * fractional indexing 要求的字节序不一致。
 */
export function sortByPosition<T extends Positioned>(rows: T[]): T[] {
  const keyed = rows.map((row) => ({ row, key: effectivePosition(row) }));
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return keyed.map(({ row }) => row);
}

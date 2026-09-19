/**
 * Task / Subtask 行 → 响应 DTO 的字段映射。
 *
 * 物理列 `settledAt`（了结时间，ADR 0006）在 API 形状上仍以既有字段名
 * `completedAt` 下发（前端兼容优先）——该字段承载 Settled At 语义：
 * status 表达"怎么了的结"（COMPLETED / CANCELLED），时间戳只记录"何时了结"。
 */

/**
 * 把行上的 `settledAt` 重命名为 DTO 字段 `completedAt`（丢弃原键）。
 * 适用于 Task 与 Subtask 行（含任意 include 形状）。
 */
export function settledToCompletedAt<T extends { settledAt: Date | null }>(
  row: T,
): Omit<T, 'settledAt'> & { completedAt: Date | null } {
  const { settledAt, ...rest } = row;
  return { ...rest, completedAt: settledAt };
}

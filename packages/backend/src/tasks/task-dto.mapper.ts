import { normalizeRepeatRule } from '@taskora/engine';
import type { RepeatRule } from '@taskora/shared';

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

/**
 * repeatRule 列（TEXT JSON）→ DTO 规则对象。坏 JSON 归 null（毒丸
 * 防御：不击穿读路径）；经 normalizeRepeatRule 收敛为规范形。
 */
export function parseRepeatRule(raw: string | null): RepeatRule | null {
  if (!raw) return null;
  try {
    return normalizeRepeatRule(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Task 行的 repeatRule 列替换为 DTO 对象（settledToCompletedAt 之前套用）。 */
export function withRepeatRuleDto<T extends { repeatRule: string | null }>(
  row: T,
): Omit<T, 'repeatRule'> & { repeatRule: RepeatRule | null } {
  const { repeatRule, ...rest } = row;
  return { ...rest, repeatRule: parseRepeatRule(repeatRule) };
}

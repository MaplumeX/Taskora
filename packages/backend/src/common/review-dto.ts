import { normalizeReviewInterval, type ReviewInterval } from '@taskora/shared';

/**
 * reviewInterval 列（TEXT JSON）→ DTO 对象。坏 JSON / 不合法结构归 null
 * （按账号默认回顾间隔处理，不击穿读路径）。
 */
export function parseReviewInterval(raw: string | null): ReviewInterval | null {
  if (!raw) return null;
  try {
    return normalizeReviewInterval(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Project / Area 行的 reviewInterval 列替换为 DTO 对象。 */
export function withReviewDto<T extends { reviewInterval: string | null }>(
  row: T,
): Omit<T, 'reviewInterval'> & { reviewInterval: ReviewInterval | null } {
  const { reviewInterval, ...rest } = row;
  return { ...rest, reviewInterval: parseReviewInterval(reviewInterval) };
}

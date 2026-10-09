/**
 * New in Today 单条已读（Seen）：用户已看过、但尚未整体确认的新到条目。
 * 元素形如 `task:<id>@<计划日期>` / `project:<id>@<计划日期>`，带计划日期
 * 是为了同一条目日后改期、再次随日期到来时重新算新到。
 */

/** 单条已读集合的上限（防脏数据膨胀；正常只含未确认那几天的新到）。 */
export const TODAY_SEEN_KEYS_MAX = 500;

export const TODAY_SEEN_KEY_PATTERN = /^(task|project):[^@\s]+@\d{4}-\d{2}-\d{2}$/;

/** 单条已读键：`<type>:<id>@<计划日期 YYYY-MM-DD>`。 */
export function todaySeenKey(type: 'task' | 'project', id: string, dateKey: string): string {
  return `${type}:${id}@${dateKey}`;
}

/**
 * 合并多端的单条已读集合：并集（只增不删），再剔除计划日期不晚于已确认
 * 日期的元素（这些条目已不可能是新到）与格式不合法的脏值。
 */
export function mergeTodaySeenKeys(
  a: readonly unknown[] | undefined,
  b: readonly unknown[] | undefined,
  reviewedOn: string | null | undefined,
): string[] {
  const merged = new Set<string>();
  for (const key of [...(a ?? []), ...(b ?? [])]) {
    if (typeof key !== 'string' || !TODAY_SEEN_KEY_PATTERN.test(key)) continue;
    if (reviewedOn && key.slice(key.lastIndexOf('@') + 1) <= reviewedOn) continue;
    merged.add(key);
  }
  return [...merged].slice(-TODAY_SEEN_KEYS_MAX);
}

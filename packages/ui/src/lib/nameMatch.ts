/**
 * 按名称匹配候选（Quick Find、Move Picker 共用）：不区分大小写的子串
 * 匹配，名称前缀命中先于包含命中，同档保持输入顺序（视觉顺序）。
 */

/** 搜索词归一化：去首尾空白、转小写；空串表示不搜索。 */
export function needleOf(query: string): string {
  return query.trim().toLowerCase();
}

/** 0：某个名称以搜索词开头；1：包含；null：不命中。 */
export function nameRank(names: string[], needle: string): 0 | 1 | null {
  let rank: 0 | 1 | null = null;
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.startsWith(needle)) return 0;
    if (lower.includes(needle)) rank = 1;
  }
  return rank;
}

export function rankByName<T>(items: T[], namesOf: (item: T) => string[], needle: string): T[] {
  const ranked: Array<{ item: T; rank: 0 | 1; index: number }> = [];
  items.forEach((item, index) => {
    const rank = nameRank(namesOf(item), needle);
    if (rank !== null) ranked.push({ item, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map(({ item }) => item);
}

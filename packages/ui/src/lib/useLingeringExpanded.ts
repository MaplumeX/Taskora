import * as React from 'react';

import { useSelectionStore, useTaskQuery, useUiInteractionStore } from '@taskora/api';

interface Lingering<T> {
  id: string;
  /** 离开前最后一次留在原处的样子（决定所在分组 / Heading / 日期）。 */
  item: T;
  /** 离开前排在它前面的那一行，用于插回原位。 */
  prevId: string | null;
  index: number;
}

/**
 * Expanded Linger（展开暂留，对齐 Things 3）：展开中的任务被编辑后不再属于
 * 当前视图（如在 Inbox 里设为今天）时，留在原位直到收起，收起后才离开。
 * 行内容由 TaskItem 按 id 读实时数据，这里只保留它离开前的位置与分组。
 *
 * `stays`：任务仍在列表里、但编辑后会换到别的分组（如 Upcoming 里改到另一个
 * 未来日期）时，返回 false 即同样按离开处理，暂留在原分组原位，收起后才移过去；
 * 不传则仍在列表里就照常跟随数据。应以稳定（模块级）函数传入。
 *
 * 任务进了 Trash 或已不存在时不暂留。`unlessShownElsewhere`：同页有多个列表
 * （如 Search 的「任务」/「Logbook」两段）时，任务已出现在另一个 Selection
 * scope 里就不暂留，避免同一任务两处展开；调用方注册的须是未暂留的行，
 * 否则暂留行会把自己判为「出现在别处」。
 */
export function useLingeringExpanded<T>(
  items: T[],
  getId: (item: T) => string,
  options?: { unlessShownElsewhere?: boolean; stays?: (before: T, now: T) => boolean },
): T[] {
  const stays = options?.stays;
  const expandedId = useUiInteractionStore((s) => s.expandedId);
  const present = React.useMemo(
    () => expandedId !== null && items.some((item) => getId(item) === expandedId),
    [items, getId, expandedId],
  );
  const { data: live, isError } = useTaskQuery(!present && expandedId ? expandedId : '');
  const shownElsewhere = useSelectionStore(
    (s) =>
      !!options?.unlessShownElsewhere &&
      !present &&
      expandedId !== null &&
      Object.values(s.scopes).some((rows) => rows.some((row) => row.id === expandedId)),
  );
  const lingeringRef = React.useRef<Lingering<T> | null>(null);

  return React.useMemo(() => {
    if (expandedId === null) {
      lingeringRef.current = null;
      return items;
    }
    const lingering = lingeringRef.current?.id === expandedId ? lingeringRef.current : null;
    const index = items.findIndex((item) => getId(item) === expandedId);
    if (index >= 0 && lingering && stays && !stays(lingering.item, items[index])) {
      const rest = [...items.slice(0, index), ...items.slice(index + 1)];
      return insertAt(rest, lingering, getId);
    }
    if (index >= 0) {
      lingeringRef.current = {
        id: expandedId,
        item: items[index],
        prevId: index > 0 ? getId(items[index - 1]) : null,
        index,
      };
      return items;
    }
    if (!lingering) return items;
    if (isError || live?.trashedAt || shownElsewhere) return items;
    return insertAt(items, lingering, getId);
  }, [items, getId, stays, expandedId, isError, live?.trashedAt, shownElsewhere]);
}

/** 把暂留行插回离开前的位置：紧跟原来的前一行，前一行也不在了就按原下标。 */
function insertAt<T>(items: T[], lingering: Lingering<T>, getId: (item: T) => string): T[] {
  const prevIndex =
    lingering.prevId === null ? -1 : items.findIndex((item) => getId(item) === lingering.prevId);
  const at =
    lingering.prevId === null
      ? 0
      : prevIndex >= 0
        ? prevIndex + 1
        : Math.min(lingering.index, items.length);
  return [...items.slice(0, at), lingering.item, ...items.slice(at)];
}

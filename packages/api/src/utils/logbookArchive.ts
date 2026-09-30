import { instantMs, sortFeedItems } from '@taskora/engine';
import type { FeedItem, TaskFeedItem } from '@taskora/shared';

/**
 * 本地 Logbook 与从 hub 读到的归档页合成一个列表（local-first-v3 issue 08）。
 *
 * 归档页按了结时间倒序连续读取。已读到的最早一条之前，本地仍可能有更早
 * 的条目（已完成的项目、进行中项目里的旧任务、尚未裁剪的行）：先藏起来，
 * 等归档页读过它们的位置再显示，否则它们会排在尚未读到的归档条目之前、
 * 翻页后又被插队。读到底后全部显示。
 *
 * 同一任务两边都有时以本地为准（本地是可编辑的最新状态）。archivedIds：
 * 只来自归档页、副本里没有的任务（只读行）。
 */
export function mergeLogbookArchive(
  local: FeedItem[],
  archived: TaskFeedItem[],
  cutoff: string | null,
  exhausted: boolean,
): { items: FeedItem[]; archivedIds: Set<string> } {
  if (!cutoff) return { items: local, archivedIds: new Set() };
  const localIds = new Set(local.map((item) => item.id));
  const remote = archived.filter((item) => !localIds.has(item.id));
  const last = archived.at(-1)?.completedAt ?? cutoff;
  const horizon = exhausted ? Number.NEGATIVE_INFINITY : (instantMs(last) ?? 0);
  const visible = local.filter((item) => {
    const settled = instantMs(item.completedAt);
    return settled === null || settled >= horizon;
  });
  return {
    items: sortFeedItems<FeedItem>([...visible, ...remote], 'logbook'),
    archivedIds: new Set(remote.map((item) => item.id)),
  };
}

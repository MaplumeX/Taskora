import type { FeedItem } from '@taskora/shared';

import { usePreferencesStore } from '@taskora/api';
import { GroupedFeedListView } from './GroupedFeedListView';
import type { ScheduledBadgeMode } from '@/components/task/TaskDateBadge';

interface Props {
  items: FeedItem[];
  emptyHint?: string;
  /** 视图本身已表达日期语境时传 false（如 Today），省略行首日期 chip。 */
  showScheduledBadge?: ScheduledBadgeMode;
  /** New in Today 新到条目的键（仅 Today 传入），见 GroupedFeedListView。 */
  freshKeys?: ReadonlySet<string>;
}

/**
 * 时间视图（今天/随时/某天）的 feed 列表入口：按全局偏好
 * 「在时间视图中按项目/区域分组任务」决定是否分组，三个时间视图页共用
 * 同一开关点。分组与平铺共用 GroupedFeedListView，拖拽排序行为一致。
 */
export function TimeViewFeedList({ items, emptyHint, showScheduledBadge, freshKeys }: Props) {
  const bucketGrouping = usePreferencesStore((s) => s.bucketGrouping);

  return (
    <GroupedFeedListView
      items={items}
      emptyHint={emptyHint}
      showScheduledBadge={showScheduledBadge}
      grouping={bucketGrouping}
      freshKeys={freshKeys}
    />
  );
}

import type { FeedItem } from '@taskora/shared';

import { usePreferencesStore } from '@taskora/api';
import { FeedListView } from './FeedListView';
import { GroupedFeedListView } from './GroupedFeedListView';

interface Props {
  view: 'today' | 'anytime' | 'someday';
  items: FeedItem[];
  emptyHint?: string;
  /** 视图本身已表达日期语境时传 false（如 Today），省略行首日期 chip。 */
  showScheduledBadge?: boolean;
}

/**
 * 时间视图（今天/随时/将来）的 feed 列表入口：按全局偏好
 * 「在时间视图中按项目/领域分组任务」选择 Grouped View（分组视图）或
 * 平铺 FeedListView，三个时间视图页共用同一开关点。
 */
export function TimeViewFeedList({ view, items, emptyHint, showScheduledBadge }: Props) {
  const bucketGrouping = usePreferencesStore((s) => s.bucketGrouping);

  if (bucketGrouping) {
    return (
      <GroupedFeedListView
        view={view}
        items={items}
        emptyHint={emptyHint}
        showScheduledBadge={showScheduledBadge}
      />
    );
  }
  return (
    <FeedListView items={items} emptyHint={emptyHint} showScheduledBadge={showScheduledBadge} />
  );
}

import { useTranslation } from 'react-i18next';

import { useEffectiveTags, useFeedQuery, usePreferencesStore } from '@taskora/api';

import { GroupedFeedListView } from '@/components/feed/GroupedFeedListView';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

/**
 * Repeating（对齐 Things 3 的隐藏列表）：所有带 Repeat Rule 的未了结任务与
 * 项目（重复链当前的一环），按计划日期（下一次出现）升序。只从 Quick Find
 * 进入；按全局偏好分组或平铺（同时间视图），不可拖拽排序。行上照常显示
 * 计划日期与重复图标。
 */
export default function Repeating() {
  const { t } = useTranslation();
  const bucketGrouping = usePreferencesStore((s) => s.bucketGrouping);
  const { data: items = [], isLoading, isError } = useFeedQuery('repeating');
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/repeating">{t('nav:repeating')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <GroupedFeedListView
          items={visible}
          grouping={bucketGrouping}
          reorderable={false}
          emptyHint={filtering ? t('tag:filterEmpty') : t('task:repeatingEmpty')}
        />
      )}
    </div>
  );
}

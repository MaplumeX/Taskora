import { useTranslation } from 'react-i18next';

import { useEffectiveTags, useFeedQuery } from '@taskora/api';
import { GroupedFeedListView } from '@/components/feed/GroupedFeedListView';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

export default function Inbox() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('inbox');
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/inbox">{t('nav:inbox')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // 收件箱为平铺列表，与时间视图不分组时共用同一套渲染与拖拽排序。
        <GroupedFeedListView
          items={visible}
          emptyHint={filtering ? t('tag:filterEmpty') : t('task:inboxEmpty')}
          grouping={false}
        />
      )}
    </div>
  );
}
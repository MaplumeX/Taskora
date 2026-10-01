import { useTranslation } from 'react-i18next';

import { useFeedQuery } from '@taskora/api';
import { GroupedFeedListView } from '@/components/feed/GroupedFeedListView';
import { PageHeading } from '@/components/layout/PageHeading';

export default function Inbox() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('inbox');

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/inbox">{t('nav:inbox')}</PageHeading>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // 收件箱为平铺列表，与时间视图不分组时共用同一套渲染与拖拽排序。
        <GroupedFeedListView items={items} emptyHint={t('task:inboxEmpty')} grouping={false} />
      )}
    </div>
  );
}
import { useTranslation } from 'react-i18next';

import { useEffectiveTags, useFeedQuery } from '@taskora/api';
import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';
import { SomedayMarkContext } from '@/components/task/somedayMark';

export default function Someday() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('someday');
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/someday">{t('nav:someday')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        // 本页条目全是 Someday，虚线标记没有区分意义，按普通样式画。
        <SomedayMarkContext.Provider value={false}>
          <TimeViewFeedList
            items={visible}
            emptyHint={filtering ? t('tag:filterEmpty') : t('task:somedayEmpty')}
          />
        </SomedayMarkContext.Provider>
      )}
    </div>
  );
}

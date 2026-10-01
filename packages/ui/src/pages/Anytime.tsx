import { useTranslation } from 'react-i18next';

import { useEffectiveTags, useFeedQuery } from '@taskora/api';
import { TimeViewFeedList } from '@/components/feed/TimeViewFeedList';
import { PageHeading } from '@/components/layout/PageHeading';
import { TagFilterBar, useTagFilter } from '@/components/tags/TagFilterBar';

export default function Anytime() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('anytime');
  const effectiveTags = useEffectiveTags();
  const { visible, filtering, bar } = useTagFilter(items, effectiveTags.ofFeedItem);

  return (
    <div className="flex flex-col gap-4">
      <PageHeading nav="/anytime">{t('nav:anytime')}</PageHeading>
      {!isLoading && !isError && <TagFilterBar {...bar} />}
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <TimeViewFeedList
          items={visible}
          emptyHint={filtering ? t('tag:filterEmpty') : t('task:anytimeEmpty')}
        />
      )}
    </div>
  );
}

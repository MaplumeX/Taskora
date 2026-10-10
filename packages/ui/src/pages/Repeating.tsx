import { useTranslation } from 'react-i18next';

import { FlatFeedPage } from '@/components/feed/FlatFeedPage';

/**
 * Repeating（对齐 Things 3 的隐藏列表）：所有带 Repeat Rule 的未了结任务与
 * 项目（重复链当前的一环），按计划日期（下一次出现）升序。只从 Quick Find
 * 进入；平铺、不分组、不可拖拽排序。行上照常显示计划日期与重复图标。
 */
export default function Repeating() {
  const { t } = useTranslation();
  return (
    <FlatFeedPage
      view="repeating"
      nav="/repeating"
      title={t('nav:repeating')}
      emptyHint={t('task:repeatingEmpty')}
    />
  );
}

import { useTranslation } from 'react-i18next';

import { FlatFeedPage } from '@/components/feed/FlatFeedPage';

/**
 * Deadlines（对齐 Things 3 的隐藏列表）：所有带截止日期的未了结任务与项目，
 * 按截止日期升序（逾期在最前，顺序由 feed 决定）。只从 Quick Find 进入；
 * 平铺、不分组、不可拖拽排序。行上照常显示截止日期倒计时与计划日期标记。
 */
export default function Deadlines() {
  const { t } = useTranslation();
  return (
    <FlatFeedPage
      view="deadlines"
      nav="/deadlines"
      title={t('nav:deadlines')}
      emptyHint={t('task:deadlinesEmpty')}
    />
  );
}

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

interface Props {
  count: number;
  onAcknowledge: () => void;
}

/**
 * New in Today 横幅（参考 Things 3）：Today 标题下的黄色提示「你有 X 个新的
 * 待办事项」，最右「好」一次清除全部黄点。X 为 0 时不渲染。
 */
export function NewInTodayBanner({ count, onAcknowledge }: Props) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div
      role="status"
      data-testid="new-in-today-banner"
      className="flex items-center gap-3 rounded-md bg-today/20 py-1 pl-3 pr-1 text-sm text-foreground"
    >
      <span className="min-w-0 flex-1 truncate">{t('task:newInTodayBanner', { count })}</span>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 font-semibold hover:bg-today/30 active:bg-today/40"
        onClick={onAcknowledge}
      >
        {t('task:newInTodayAck')}
      </Button>
    </div>
  );
}

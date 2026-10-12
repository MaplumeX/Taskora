import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface Props {
  /** 当前列表的稍后项数（Tag 过滤之后）；为 0 时不渲染。 */
  count: number;
  hidden: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Hide Later Items（隐藏稍后项）：列表底部切换稍后项显示的按钮（对齐 Things 3）。
 * 显示时为「隐藏稍后项」，隐藏时为「显示 N 个稍后项」。不是 Selection 停留点。
 */
export function LaterItemsToggle({ count, hidden, onToggle, className }: Props) {
  const { t } = useTranslation('common');
  if (count === 0) return null;
  return (
    <button
      type="button"
      data-testid="later-items-toggle"
      onClick={(event) => {
        // 列表空白处点击会清空 Selection，按钮自己的点击不冒泡过去。
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        'self-start rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40',
        className,
      )}
    >
      {hidden ? t('showLaterItems', { count }) : t('hideLaterItems')}
    </button>
  );
}

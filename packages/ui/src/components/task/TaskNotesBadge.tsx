import { StickyNote } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface Props {
  /** 备注；空或纯空白不渲染。 */
  notes?: string | null;
  className?: string;
}

/** Task 行上的备注徽标：便签图标，紧贴标题文本显示（参考 Things 3）。 */
export function TaskNotesBadge({ notes, className }: Props) {
  const { t } = useTranslation();
  if (!notes?.trim()) return null;
  return (
    <span
      data-notes-badge
      title={t('task:notes')}
      className={cn('inline-flex items-center text-xs text-muted-foreground', className)}
    >
      <StickyNote className="h-3 w-3" />
    </span>
  );
}

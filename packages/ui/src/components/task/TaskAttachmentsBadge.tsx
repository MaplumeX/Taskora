import { Paperclip } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AttachmentResponseDto } from '@taskora/shared';

interface Props {
  /** 附件；空数组或 undefined 不渲染。 */
  attachments?: AttachmentResponseDto[];
  className?: string;
}

/** Task 行上的附件徽标：回形针，与备注 / 子任务徽标同排（ADR-0019）。 */
export function TaskAttachmentsBadge({ attachments, className }: Props) {
  if (!attachments?.length) return null;
  return (
    <span
      data-attachments-badge
      className={cn('inline-flex items-center text-xs text-muted-foreground', className)}
    >
      <Paperclip className="h-3 w-3" />
    </span>
  );
}

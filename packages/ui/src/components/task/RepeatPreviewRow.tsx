import { Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { RepeatPreview } from '@taskora/api';

import { cn } from '@/lib/utils';

interface Props {
  preview: RepeatPreview;
  /** 归属小字（projectTitle 优先，否则 areaTitle），与任务行同一口径。 */
  projectTitle?: string;
  areaTitle?: string;
}

/**
 * 下次预告行（Repeat Preview，recurring-tasks-v2）：重复链下一次的只读
 * 投影。与任务行同高同对齐，但整行弱化、无复选框（槽位放 ↻）、不可
 * 点击 / 拖拽，也不进 Selection——它不是 Task。
 */
export function RepeatPreviewRow({ preview, projectTitle, areaTitle }: Props) {
  const { t } = useTranslation();
  const tag = projectTitle ?? areaTitle;
  return (
    <div
      data-repeat-preview-row={preview.sourceTaskId}
      title={t('task:repeatPreviewHint')}
      className={cn(
        'flex min-w-0 select-none items-center gap-2.5 rounded-md px-2 py-1 text-muted-foreground',
        !tag && 'h-8 max-md:h-11',
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <Repeat className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="truncate text-body">{preview.title || t('task:newTaskPlaceholder')}</span>
        {tag && <span className="truncate text-meta">{tag}</span>}
      </div>
    </div>
  );
}

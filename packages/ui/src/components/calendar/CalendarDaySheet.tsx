import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

import type { TaskResponseDto } from '@taskora/shared';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TaskListView } from '@/components/task/TaskListView';
import { MultiSelectEnabledContext } from '@/components/task/multiSelectContext';
import { RepeatPreviewRow } from '@/components/task/RepeatPreviewRow';
import { i18n, useUiInteractionStore, type RepeatPreview } from '@taskora/api';
import { cn } from '@/lib/utils';

interface Props {
  /** 打开的日期；null 为关闭。 */
  date: Date | null;
  tasks: TaskResponseDto[];
  /** 当天的下次预告（只读，排在任务之后）。 */
  previews?: RepeatPreview[];
  onClose: () => void;
}

/**
 * 日历「点格子看当天」的面板：窄屏为底部面板、宽屏为居中卡片；内容是
 * 标准任务行（完整标题、勾选、项目归属、原地展开编辑）。基于 Radix
 * Dialog，Escape / 系统返回手势可关。
 */
export function CalendarDaySheet({ date, tasks, previews = [], onClose }: Props) {
  const { t } = useTranslation();
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);

  const title = date
    ? new Intl.DateTimeFormat(i18n.language, {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }).format(date)
    : '';

  return (
    <Dialog
      open={date !== null}
      onOpenChange={(open) => {
        if (open) return;
        // 面板里展开的任务随面板一起收起，避免回到网格后残留展开态。
        setExpandedId(null);
        onClose();
      }}
    >
      <DialogContent
        hideClose
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          // 窄屏：底部面板（随键盘上移）
          'bottom-[var(--kb-inset,0px)] left-0 right-0 top-auto flex max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-b-none rounded-t-2xl border-x-0 border-b-0 p-0 pb-[env(safe-area-inset-bottom)] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:rounded-b-none sm:rounded-t-2xl max-md:max-w-none',
          // 宽屏：居中卡片
          'md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:max-h-[70vh] md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:pb-0 md:data-[state=closed]:slide-out-to-bottom-2 md:data-[state=open]:slide-in-from-bottom-2',
        )}
      >
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30 md:hidden"
        />
        <div className="flex shrink-0 items-center justify-between pl-4 pr-1 md:pt-2">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogClose
            aria-label={t('common:close')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-accent"
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </div>
        <div className="min-h-0 overflow-y-auto px-2 pb-4">
          {/* 多选工具栏在卡片之下，当天列表不支持左滑多选。 */}
          <MultiSelectEnabledContext.Provider value={false}>
            <TaskListView
              tasks={tasks}
              emptyHint={t('calendar:dayEmpty')}
              hideEmptyState={previews.length > 0}
            />
          </MultiSelectEnabledContext.Provider>
          {previews.map((preview) => (
            <RepeatPreviewRow key={preview.sourceTaskId} preview={preview} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

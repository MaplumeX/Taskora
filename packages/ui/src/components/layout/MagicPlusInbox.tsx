import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  createFromQuickAddDraft,
  getAreas,
  getProjects,
  getTags,
  useCreateTask,
  useUpdateTask,
  type QuickAddDeps,
  type QuickAddDraft,
} from '@taskora/api';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  QuickAddCard,
  type QuickAddCardHandle,
  type QuickAddSubmitOptions,
} from '@/components/task/QuickAddCard';
import { cn } from '@/lib/utils';
import { useMagicPlusInboxTarget } from '../../lib/appDnd';

/**
 * Magic Plus 的左下角 Inbox 目标（对齐 Things 3 iPhone）：拖动添加按钮时浮现，
 * 在其上松手弹出快速添加卡片（缺省归属 Inbox），不离开当前页——新任务在
 * 当前列表里看不见，就地写卡片。Inbox 页与首页不出现（那里点按就是加到 Inbox）。
 */
export function MagicPlusInbox() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = React.useState(false);
  const cardRef = React.useRef<QuickAddCardHandle>(null);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const target = useMagicPlusInboxTarget(() => setOpen(true));
  const offered = pathname !== '/inbox' && pathname !== '/home';

  // 落库走快速添加的共用函数；写入经 mutation，列表缓存随之更新。
  const deps: QuickAddDeps = {
    createTask: (data) => createTask.mutateAsync(data),
    updateTask: (id, data) => updateTask.mutateAsync({ id, data }),
    getTags,
    getProjects,
    getAreas,
  };

  const handleSubmit = async (draft: QuickAddDraft, { keepOpen }: QuickAddSubmitOptions) => {
    try {
      const result = await createFromQuickAddDraft(draft, deps);
      if (!result) return;
      const place =
        result.placedIn.kind === 'inbox' ? t('nav:inbox') : result.placedIn.title;
      toast.success(t('task:quickAddAddedTo', { place }));
      if (!keepOpen) setOpen(false);
    } catch (error) {
      toast.error(t('task:quickAddFailed'));
      throw error;
    }
  };

  return (
    <>
      {offered && target.dragging && (
        <div
          ref={target.setNodeRef}
          data-testid="magic-plus-inbox"
          aria-hidden="true"
          className={cn(
            'fixed left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary/60 bg-background text-primary shadow-popover transition-transform duration-base ease-spring animate-in fade-in-0 zoom-in-90 md:hidden',
            'bottom-[calc(1.25rem+var(--safe-area-bottom)+var(--kb-inset,0px))]',
            target.isOver && 'scale-110 border-solid bg-primary text-primary-foreground',
          )}
        >
          <Inbox className="h-6 w-6" />
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          hideClose
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cardRef.current?.focusTitle();
          }}
          className="top-14 translate-y-0 bg-transparent p-0 shadow-none"
        >
          <DialogTitle className="sr-only">{t('nav:inbox')}</DialogTitle>
          <QuickAddCard
            ref={cardRef}
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
            footer={({ canSubmit, submit }) => (
              <div className="-mb-1 flex items-center justify-end gap-1 pl-6">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                  className="h-9 px-3 text-muted-foreground"
                >
                  {t('common:cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canSubmit}
                  onClick={() => submit({ keepOpen: false })}
                  className="h-9 px-4 text-sm"
                >
                  {t('statusbar:quickAddSubmit')}
                </Button>
              </div>
            )}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

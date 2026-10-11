import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { haptic, undoHistory, useUndoPromptStore, type UndoAction } from '@taskora/api';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ACTION_KEYS: Record<UndoAction, string> = {
  create: 'undoActionCreate',
  complete: 'undoActionComplete',
  cancel: 'undoActionCancel',
  reopen: 'undoActionReopen',
  trash: 'undoActionTrash',
  putBack: 'undoActionPutBack',
  move: 'undoActionMove',
  schedule: 'undoActionSchedule',
  deadline: 'undoActionDeadline',
  tags: 'undoActionTags',
  edit: 'undoActionEdit',
  reorder: 'undoActionReorder',
  change: 'undoActionChange',
};

/**
 * 撤销确认（对齐 Things 3 iPhone：摇一摇弹出「撤销 …」）。平台壳请求后读取
 * 最近一步可撤销的动作；没有可撤销的就不弹。确认即撤销这一步。
 */
export function UndoPrompt() {
  const { t } = useTranslation();
  const requested = useUndoPromptStore((s) => s.open);
  const close = useUndoPromptStore((s) => s.close);
  const [action, setAction] = React.useState<UndoAction | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!requested) {
      setAction(null);
      return;
    }
    let cancelled = false;
    void undoHistory.peek().then((next) => {
      if (cancelled) return;
      if (next) setAction(next);
      else close();
    });
    return () => {
      cancelled = true;
    };
  }, [requested, close]);

  const confirm = async () => {
    setPending(true);
    try {
      if (await undoHistory.undo()) haptic('confirm');
    } catch {
      toast.error(t('common:operationFailed'));
    } finally {
      setPending(false);
      close();
    }
  };

  return (
    <Dialog open={requested && action !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent hideClose aria-describedby={undefined} className="max-w-xs">
        <DialogHeader>
          <DialogTitle>
            {action
              ? t('common:undoPromptTitle', { action: t(`common:${ACTION_KEYS[action]}`) })
              : ''}
          </DialogTitle>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end gap-2 sm:space-x-0">
          <Button variant="ghost" disabled={pending} onClick={close}>
            {t('common:cancel')}
          </Button>
          <Button disabled={pending} onClick={() => void confirm()}>
            {t('common:undo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

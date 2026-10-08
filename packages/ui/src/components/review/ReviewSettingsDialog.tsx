import { useTranslation } from 'react-i18next';
import { CalendarCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ReviewScheduleChips, useReviewActions, type ReviewTarget } from './ReviewSchedule';

/**
 * 「…」菜单里的回顾设置：间隔、下次回顾日与标记已回顾。平时页面上不显示
 * 任何回顾信息，回顾设置只从这里进入。
 */
export function ReviewSettingsDialog({
  target,
  open,
  onOpenChange,
}: {
  target: ReviewTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('review');
  const actions = useReviewActions(target);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('settings')}</DialogTitle>
          <DialogDescription>{t('settingsDescription')}</DialogDescription>
        </DialogHeader>
        <ReviewScheduleChips target={target} />
        <DialogFooter>
          <Button
            onClick={() => {
              actions.markReviewed();
              onOpenChange(false);
            }}
          >
            <CalendarCheck />
            {t('markReviewed')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

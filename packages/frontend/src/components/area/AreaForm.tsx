import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { AreaResponseDto, CreateAreaDto, UpdateAreaDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateArea, useUpdateArea } from '@/lib/hooks/useAreas';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area?: AreaResponseDto;
}

export function AreaForm({ open, onOpenChange, area }: Props) {
  const { t } = useTranslation();
  const isEdit = !!area;
  const [title, setTitle] = React.useState(area?.title ?? '');
  const [notes, setNotes] = React.useState(area?.notes ?? '');
  React.useEffect(() => {
    if (open) {
      setTitle(area?.title ?? '');
      setNotes(area?.notes ?? '');
    }
  }, [open, area]);

  const createArea = useCreateArea();
  const updateArea = useUpdateArea();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error(t('common:titleRequired'));
      return;
    }
    if (isEdit && area) {
      const data: UpdateAreaDto = { title: trimmed, notes: notes || undefined };
      updateArea.mutate(
        { id: area.id, data },
        {
          onSuccess: () => {
            onOpenChange(false);
          },
          onError: () => toast.error(t('common:saveFailed')),
        },
      );
    } else {
      const data: CreateAreaDto = { title: trimmed, notes: notes || undefined };
      createArea.mutate(data, {
        onSuccess: () => {
          toast.success(t('area:created'));
          onOpenChange(false);
        },
        onError: () => toast.error(t('common:createFailed')),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('area:edit') : t('area:new')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="area-title">{t('common:title')}</Label>
            <Input
              id="area-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('area:titlePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="area-notes">{t('common:notes')}</Label>
            <Textarea
              id="area-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('common:optionalNotes')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button onClick={submit} disabled={createArea.isPending || updateArea.isPending}>
            {isEdit ? t('common:save') : t('common:createAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
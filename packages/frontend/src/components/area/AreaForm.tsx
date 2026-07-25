import * as React from 'react';

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
      toast.error('请填写标题');
      return;
    }
    if (isEdit && area) {
      const data: UpdateAreaDto = { title: trimmed, notes: notes || undefined };
      updateArea.mutate(
        { id: area.id, data },
        {
          onSuccess: () => {
            toast.success('已保存');
            onOpenChange(false);
          },
          onError: () => toast.error('保存失败'),
        },
      );
    } else {
      const data: CreateAreaDto = { title: trimmed, notes: notes || undefined };
      createArea.mutate(data, {
        onSuccess: () => {
          toast.success('区域已创建');
          onOpenChange(false);
        },
        onError: () => toast.error('创建失败'),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑区域' : '新区域'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="area-title">标题</Label>
            <Input
              id="area-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="区域名称"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="area-notes">备注</Label>
            <Textarea
              id="area-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="可选备注…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={createArea.isPending || updateArea.isPending}>
            {isEdit ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
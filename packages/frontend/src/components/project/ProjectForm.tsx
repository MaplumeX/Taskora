import * as React from 'react';

import type { CreateProjectDto, ProjectResponseDto, UpdateProjectDto } from '@taskora/shared';

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
import { useCreateProject, useUpdateProject } from '@/lib/hooks/useProjects';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** if provided, edit mode; else create */
  project?: ProjectResponseDto;
  defaultAreaId?: string;
}

export function ProjectForm({ open, onOpenChange, project, defaultAreaId }: Props) {
  const isEdit = !!project;
  const [title, setTitle] = React.useState(project?.title ?? '');
  const [notes, setNotes] = React.useState(project?.notes ?? '');
  React.useEffect(() => {
    if (open) {
      setTitle(project?.title ?? '');
      setNotes(project?.notes ?? '');
    }
  }, [open, project]);

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('请填写标题');
      return;
    }
    if (isEdit && project) {
      const data: UpdateProjectDto = { title: trimmed, notes: notes || undefined };
      updateProject.mutate(
        { id: project.id, data },
        {
          onSuccess: () => {
            toast.success('已保存');
            onOpenChange(false);
          },
          onError: () => toast.error('保存失败'),
        },
      );
    } else {
      const data: CreateProjectDto = {
        title: trimmed,
        notes: notes || undefined,
        areaId: defaultAreaId,
      };
      createProject.mutate(data, {
        onSuccess: () => {
          toast.success('项目已创建');
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
          <DialogTitle>{isEdit ? '编辑项目' : '新项目'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-title">标题</Label>
            <Input
              id="project-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="项目名称"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-notes">备注</Label>
            <Textarea
              id="project-notes"
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
          <Button onClick={submit} disabled={createProject.isPending || updateProject.isPending}>
            {isEdit ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import * as React from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      toast.error(t('common:titleRequired'));
      return;
    }
    if (isEdit && project) {
      const data: UpdateProjectDto = { title: trimmed, notes: notes || undefined };
      updateProject.mutate(
        { id: project.id, data },
        {
          onSuccess: () => {
            toast.success(t('common:saved'));
            onOpenChange(false);
          },
          onError: () => toast.error(t('common:saveFailed')),
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
          toast.success(t('project:created'));
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
          <DialogTitle>{isEdit ? t('project:edit') : t('project:new')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-title">{t('common:title')}</Label>
            <Input
              id="project-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('project:titlePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-notes">{t('common:notes')}</Label>
            <Textarea
              id="project-notes"
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
          <Button onClick={submit} disabled={createProject.isPending || updateProject.isPending}>
            {isEdit ? t('common:save') : t('common:createAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
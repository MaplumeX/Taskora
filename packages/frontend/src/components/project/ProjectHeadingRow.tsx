import * as React from 'react';
import { FolderInput, GripVertical, MoreHorizontal, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ProjectHeadingResponseDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useConvertProjectHeadingToProject,
  useDeleteProjectHeading,
  useUpdateProjectHeading,
} from '@/lib/hooks/useProjectHeadings';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';

interface Props {
  heading: ProjectHeadingResponseDto;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export function ProjectHeadingRow({ heading, dragHandleProps }: Props) {
  const { t } = useTranslation();
  const pendingAutoEditId = useUiInteractionStore((state) => state.pendingAutoEditId);
  const clearPendingAutoEditId = useUiInteractionStore((state) => state.clearPendingAutoEditId);
  const autoEdit = pendingAutoEditId === heading.id;
  const [editing, setEditing] = React.useState(autoEdit);
  const [draft, setDraft] = React.useState(heading.title);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const updateHeading = useUpdateProjectHeading(heading.projectId);
  const deleteHeading = useDeleteProjectHeading(heading.projectId);
  const convertHeading = useConvertProjectHeadingToProject(heading.projectId);

  React.useEffect(() => {
    if (!autoEdit) return;
    setEditing(true);
    clearPendingAutoEditId();
  }, [autoEdit, clearPendingAutoEditId]);

  React.useEffect(() => {
    if (!editing) setDraft(heading.title);
  }, [editing, heading.title]);

  React.useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next === heading.title) return;
    updateHeading.mutate(
      { id: heading.id, data: { title: next } },
      {
        onError: () => {
          setDraft(heading.title);
          toast.error(t('common:saveFailed'));
        },
      },
    );
  };

  return (
    <>
      <div className="group flex h-10 items-center gap-1.5 border-b border-border pt-2">
        <button
          type="button"
          aria-label={t('project:dragHeading')}
          className="cursor-grab rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            aria-label={t('project:headingPlaceholder')}
            placeholder={t('project:headingPlaceholder')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(heading.title);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold tracking-wide text-foreground outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold tracking-wide text-foreground"
          >
            {heading.title || t('project:headingPlaceholder')}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('project:headingActions')}
              className="h-7 w-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={convertHeading.isPending}
              onSelect={() =>
                convertHeading.mutate(heading.id, {
                  onSuccess: () => toast.success(t('project:convertSuccess')),
                  onError: () => toast.error(t('project:convertFailed')),
                })
              }
            >
              <FolderInput className="mr-2 h-4 w-4" />
              {t('project:convertToProject')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('project:deleteHeading')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('project:deleteHeadingTitle')}</DialogTitle>
            <DialogDescription>{t('project:deleteHeadingDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteHeading.isPending}
              onClick={() => {
                deleteHeading.mutate(heading.id, {
                  onSuccess: () => setConfirmOpen(false),
                  onError: () => toast.error(t('project:deleteHeadingFailed')),
                });
              }}
            >
              {t('project:deleteHeading')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

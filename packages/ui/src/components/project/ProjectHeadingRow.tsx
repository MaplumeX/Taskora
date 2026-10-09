import * as React from 'react';
import { Archive, FolderInput, GripVertical, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HeadingStatus } from '@taskora/shared';
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
  useArchiveProjectHeading,
  useConvertProjectHeadingToProject,
  useDeleteProjectHeading,
  useUnarchiveProjectHeading,
  useUpdateProjectHeading,
} from '@taskora/api';
import { useUiInteractionStore } from '@taskora/api';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '../../lib/use-media-query';
import { MenuItems, type MenuItem } from '@/components/common/MenuItems';
import { ActionSheet, ActionSheetContent, ActionSheetTrigger } from '@/components/ui/action-sheet';

interface Props {
  heading: ProjectHeadingResponseDto;
  /** 键盘 Selection 停留在该 Heading 行时高亮（⌘K/⌫ 对其无效）。 */
  selected?: boolean;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export function ProjectHeadingRow({ heading, selected = false, dragHandleProps }: Props) {
  const { t } = useTranslation();
  const pendingAutoEditId = useUiInteractionStore((state) => state.pendingAutoEditId);
  const clearPendingAutoEditId = useUiInteractionStore((state) => state.clearPendingAutoEditId);
  const autoEdit = pendingAutoEditId === heading.id;
  const [editing, setEditing] = React.useState(autoEdit);
  const [draft, setDraft] = React.useState(heading.title);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const archived = heading.status === HeadingStatus.COMPLETED;
  const updateHeading = useUpdateProjectHeading(heading.projectId);
  const deleteHeading = useDeleteProjectHeading(heading.projectId);
  const convertHeading = useConvertProjectHeadingToProject(heading.projectId);
  const archiveHeading = useArchiveProjectHeading(heading.projectId);
  const unarchiveHeading = useUnarchiveProjectHeading(heading.projectId);
  const isDesktop = useIsDesktop();

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

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t('project:headingActions')}
      className="h-7 w-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-md:h-11 max-md:w-11 max-md:opacity-100"
    >
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );
  const items: MenuItem[] = [
    {
      icon: FolderInput,
      label: t('project:convertToProject'),
      disabled: convertHeading.isPending,
      onSelect: () =>
        convertHeading.mutate(heading.id, {
          onSuccess: () => toast.success(t('project:convertSuccess')),
          onError: () => toast.error(t('project:convertFailed')),
        }),
    },
    archived
      ? {
          icon: RotateCcw,
          label: t('project:unarchive'),
          disabled: unarchiveHeading.isPending,
          onSelect: () =>
            unarchiveHeading.mutate(heading.id, {
              onSuccess: () => toast.success(t('project:unarchiveSuccess')),
              onError: () => toast.error(t('project:unarchiveFailed')),
            }),
        }
      : {
          icon: Archive,
          label: t('project:archive'),
          disabled: archiveHeading.isPending,
          onSelect: () =>
            archiveHeading.mutate(heading.id, {
              onSuccess: () => toast.success(t('project:archiveSuccess')),
              onError: () => toast.error(t('project:archiveFailed')),
            }),
        },
    {
      icon: Trash2,
      label: t('project:deleteHeading'),
      destructive: true,
      onSelect: () => setConfirmOpen(true),
    },
  ];

  return (
    <>
      <div
        aria-selected={selected || undefined}
        data-selection-row={heading.id}
        tabIndex={selected ? 0 : -1}
        className={cn(
          // Project Heading（Things 3）：蓝色小节标题 + 下方 1px 细线。
          // 细线用 ::after 独立绘制并左右内缩，不占用行的边框，选中背景才能保持四角圆角。
          'group relative flex h-9 items-center gap-1.5 rounded-md pt-1 max-md:h-11',
          "after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:h-px after:bg-border after:content-['']",
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
          selected && 'bg-selection after:opacity-0 focus-visible:ring-0',
        )}
      >
        {!archived && (
          <button
            type="button"
            aria-label={t('project:dragHeading')}
            className="cursor-grab rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 active:cursor-grabbing"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
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
            className="min-w-0 flex-1 border-0 bg-transparent text-section font-bold text-primary outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left text-section font-bold text-primary"
          >
            {heading.title || t('project:headingPlaceholder')}
          </button>
        )}
        {isDesktop ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {items.map(({ icon: Icon, label, disabled, destructive, onSelect }) => (
                <DropdownMenuItem
                  key={label}
                  disabled={disabled}
                  className={cn(
                    destructive &&
                      'text-destructive focus:bg-destructive focus:text-destructive-foreground',
                  )}
                  onSelect={onSelect}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <ActionSheet>
            <ActionSheetTrigger asChild>{trigger}</ActionSheetTrigger>
            <ActionSheetContent title={heading.title || t('project:headingPlaceholder')}>
              <MenuItems items={items} sheet />
            </ActionSheetContent>
          </ActionSheet>
        )}
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

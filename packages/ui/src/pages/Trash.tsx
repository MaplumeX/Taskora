import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Folder, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import { TaskContextMenu } from '@/components/task/TaskContextMenu';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import { useEmptyTrash, useFeedQuery, useSelectionScope, useTaskRowSelection } from '@taskora/api';
import { useRestoreProject } from '@taskora/api';
import { toast } from 'sonner';

import type { FeedItem, TaskResponseDto } from '@taskora/shared';
import { cn } from '@/lib/utils';

export default function Trash() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: items = [], isLoading, isError } = useFeedQuery('trash');
  const restoreProject = useRestoreProject();
  const emptyTrashMutation = useEmptyTrash();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { selectedIds, handleRowClick, handleBlankClick } = useTaskRowSelection();
  // 注册可遍历行：任务行 + 项目行（Project 行仅作遍历停留点，⌫ 对其
  // 无效——恢复仍走行内「恢复」按钮；⌫ 对任务行遵循本页恢复约定）。
  const rows = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        kind: item.type === 'task' ? ('task' as const) : ('project' as const),
        completed: false,
      })),
    [items],
  );
  useSelectionScope(rows);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t('nav:trash')}</h1>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={items.length === 0 || emptyTrashMutation.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          {t('common:emptyTrash')}
        </Button>
      </div>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center font-display text-base font-semibold text-muted-foreground">
          {t('task:trashEmpty')}
        </p>
      ) : (
        <div className="flex flex-col" onClick={handleBlankClick}>
          {items.map((item) =>
            item.type === 'task' ? (
              <TrashTaskRow
                key={item.id}
                item={item}
                selected={selectedIds.includes(item.id)}
                onRowClick={() => handleRowClick(item.id)}
              />
            ) : (
              <TrashProjectRow
                key={item.id}
                item={item}
                onRestore={() =>
                  restoreProject.mutate(item.id, {
                    onError: () => toast.error(t('common:restoreFailed')),
                  })
                }
                onNavigate={() => navigate(`/projects/${item.id}`)}
              />
            ),
          )}
        </div>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common:emptyTrashConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('common:emptyTrashConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={emptyTrashMutation.isPending}
            >
              {t('common:cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={emptyTrashMutation.isPending}
              onClick={() => {
                emptyTrashMutation.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmOpen(false);
                    toast.success(t('common:emptyTrashSuccess'));
                  },
                  onError: () => toast.error(t('common:emptyTrashFailed')),
                });
              }}
            >
              {t('common:emptyTrashConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrashTaskRow({
  item,
  selected,
  onRowClick,
}: {
  item: FeedItem;
  selected?: boolean;
  onRowClick?: () => void;
}) {
  const task = { ...item, subtasks: [] } as TaskResponseDto;
  return (
    <div
      data-task-item
      aria-selected={selected || undefined}
      className={cn('group flex flex-col transition-colors', selected && 'bg-accent rounded-lg')}
    >
      <TaskContextMenu task={task} current={task} variant="trash">
        <div
          role={onRowClick ? 'button' : undefined}
          tabIndex={onRowClick ? 0 : undefined}
          onClick={(e) => {
            if (!onRowClick) return;
            e.stopPropagation();
            onRowClick();
          }}
          className="flex h-12 cursor-pointer items-center gap-3 px-2 text-sm text-muted-foreground"
        >
          <TaskCheckbox checked={false} onToggle={() => {}} disabled />
          <span className="flex-1 truncate line-through">{item.title}</span>
          <TaskDateBadge scheduledDate={item.scheduledDate} />
        </div>
      </TaskContextMenu>
    </div>
  );
}

function TrashProjectRow({
  item,
  onRestore,
  onNavigate,
}: {
  item: FeedItem;
  onRestore: () => void;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-task-item
      className="group flex h-12 cursor-pointer items-center gap-3 px-2 text-sm text-muted-foreground hover:bg-accent/40"
      onClick={onNavigate}
    >
      <Folder className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 truncate line-through">
        {item.title || t('project:newItemPlaceholder')}
      </span>
      <button
        className="ml-auto rounded px-1 py-2 text-xs text-muted-foreground hover:text-foreground max-md:-my-2"
        onClick={(e) => {
          e.stopPropagation();
          onRestore();
        }}
      >
        {t('common:restore')}
      </button>
      <TaskDateBadge scheduledDate={item.scheduledDate} />
    </div>
  );
}
import { useState } from 'react';
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
import { useEmptyTrash, useFeedQuery } from '@/lib/hooks/useFeed';
import { useRestoreProject } from '@/lib/hooks/useProjects';
import { toast } from 'sonner';

import type { FeedItem, TaskResponseDto } from '@taskora/shared';

export default function Trash() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: items = [], isLoading, isError } = useFeedQuery('trash');
  const restoreProject = useRestoreProject();
  const emptyTrashMutation = useEmptyTrash();
  const [confirmOpen, setConfirmOpen] = useState(false);

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
        <div className="flex flex-col">
          {items.map((item) =>
            item.type === 'task' ? (
              <TrashTaskRow key={item.id} item={item} />
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

function TrashTaskRow({ item }: { item: FeedItem }) {
  const task = { ...item, subtasks: [] } as TaskResponseDto;
  return (
    <div data-task-item className="group flex flex-col transition-colors">
      <TaskContextMenu task={task} current={task} variant="trash">
        <div className="flex h-12 cursor-pointer items-center gap-3 px-2 text-sm text-muted-foreground">
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
        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
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
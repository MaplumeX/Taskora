import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';

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
  selectionStateOf,
  useAreasQuery,
  useCompleteTask,
  useEmptyTrash,
  useFeedQuery,
  useProjectsQuery,
  useSelectionScope,
  useTaskRowSelection,
  useUncancelTask,
  useUncompleteTask,
} from '@taskora/api';
import { toast } from 'sonner';

import type { FeedItem } from '@taskora/shared';
import { FeedItemRow } from '@/components/feed/FeedItemRow';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeading } from '@/components/layout/PageHeading';

/**
 * Trash（对齐 Things 3）：条目与其他视图同样呈现、同样可编辑；独有的只有
 * 菜单「放回」与「清空废纸篓」。改状态留在 Trash，改日期 / 归属 / 标签等
 * 即放回（数据层规则，spec: trash-things3）。
 */
export default function Trash() {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError } = useFeedQuery('trash');
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const emptyTrashMutation = useEmptyTrash();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const uncancelTask = useUncancelTask();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { selectedIds, expandedId, handleRowClick, handleBlankClick } = useTaskRowSelection();

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );
  const areaMap = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a.title])), [areas]);

  // 注册可遍历行：任务行 + 项目行（⌫ 在本页为放回）。
  const rows = useMemo(
    () =>
      items.map((item) =>
        item.type === 'task'
          ? {
              id: item.id,
              kind: 'task' as const,
              completed: item.status === 'COMPLETED',
              cancelled: item.status === 'CANCELLED',
              tagIds: item.tags.map((tag) => tag.id),
            }
          : { id: item.id, kind: 'project' as const, tagIds: item.tags.map((tag) => tag.id) },
      ),
    [items],
  );
  useSelectionScope(rows);

  const toggleComplete = (item: FeedItem) => {
    if (item.type !== 'task') return;
    if (item.status === 'CANCELLED') uncancelTask.mutate(item.id);
    else if (item.status === 'COMPLETED') uncompleteTask.mutate(item.id);
    else completeTask.mutate(item.id, { onError: () => toast.error(t('common:operationFailed')) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <PageHeading nav="/trash">{t('nav:trash')}</PageHeading>
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
        <EmptyState hint={t('task:trashEmpty')} />
      ) : (
        <div className="flex flex-col gap-1" onClick={handleBlankClick}>
          {items.map((item) => {
            const isTask = item.type === 'task';
            return (
              <FeedItemRow
                key={item.id}
                item={item}
                projectTitle={isTask && item.projectId ? projectMap[item.projectId] : undefined}
                areaTitle={isTask && item.areaId ? areaMap[item.areaId] : undefined}
                selectionState={selectionStateOf(selectedIds, expandedId, item.id)}
                onToggleComplete={() => toggleComplete(item)}
                onRowClick={isTask ? () => handleRowClick(item.id) : undefined}
              />
            );
          })}
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

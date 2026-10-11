import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { UpdateTaskDto } from '@taskora/shared';
import { getClientKind, useTaskQuery, useUiInteractionStore, useUpdateTask } from '@taskora/api';

import { FieldPickerDialog } from '@/components/common/FieldPicker';
import { ScheduledDateField } from './fields/ScheduledDateField';

/**
 * 右滑任务行弹出的计划卡片（对齐 Things 3 iPhone：右滑弹出 When）。全局只挂
 * 一张，作用于 uiInteraction 的 swipeWhenTaskId；内容与展开卡片里的计划
 * 字段相同（可设提醒的端同样就地出现提醒区）。
 */
export function SwipeWhenPicker() {
  const { t } = useTranslation();
  const taskId = useUiInteractionStore((s) => s.swipeWhenTaskId);
  const close = () => useUiInteractionStore.getState().setSwipeWhenTaskId(null);
  const { data: task } = useTaskQuery(taskId ?? '');
  const updateTask = useUpdateTask();
  const current = taskId && task?.id === taskId ? task : null;

  const patch = (data: UpdateTaskDto) => {
    if (!taskId) return;
    updateTask.mutate({ id: taskId, data }, { onError: () => toast.error(t('common:saveFailed')) });
  };

  return (
    <FieldPickerDialog
      label={t('task:multiSelectSchedule')}
      open={!!current}
      onOpenChange={(open) => !open && close()}
    >
      {current && (
        <ScheduledDateField
          current={current}
          onPatch={patch}
          onClose={close}
          showReminder={getClientKind() !== 'web'}
        />
      )}
    </FieldPickerDialog>
  );
}

import * as React from 'react';
import { Calendar, Flag, ListPlus, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { MarkdownNotesEditor } from '@/components/common/MarkdownNotesEditor';
import {
  formatDeadlineCountdown,
  getClientKind,
  isOverdue,
  isToday,
  parseCalendarDate,
  useUpdateTask,
} from '@taskora/api';
import { toast } from 'sonner';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { TagsField } from './fields/TagsField';
import { FieldChip, FieldIconButton, scheduledChipOf } from './fields/FieldChip';
import { TaskSubtaskList, type TaskSubtaskListHandle } from './TaskSubtaskList';

interface Props {
  task: TaskResponseDto;
  current: TaskResponseDto;
}

export function TaskRowExpanded({ task, current }: Props) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask();

  const [notes, setNotes] = React.useState(current.notes ?? '');

  const subtasks = current.subtasks ?? [];
  const subtaskListRef = React.useRef<TaskSubtaskListHandle>(null);

  const patch = (data: UpdateTaskDto) =>
    updateTask.mutate(
      { id: task.id, data },
      { onError: () => toast.error(t('common:saveFailed')) },
    );

  const commitNotes = () => {
    if (notes !== (current.notes ?? '')) patch({ notes });
  };

  // 已设值字段在左下显示为 chip（点击打开同一编辑器），未设值字段在右下为图标
  // （Things 3 展开任务的底栏）。
  const scheduledChip = scheduledChipOf(current, t);
  const dueDate = current.dueDate ? parseCalendarDate(current.dueDate) : null;
  const tags = current.tags ?? [];

  return (
    <div
      className="flex flex-col gap-3 px-2 pb-2 pl-[2.375rem] pt-1 max-md:pl-2"
      onClick={(e) => e.stopPropagation()}
    >
      <MarkdownNotesEditor
        value={notes}
        onChange={setNotes}
        onBlurCommit={commitNotes}
        placeholder={t('task:notePlaceholder')}
      />

      <TaskSubtaskList ref={subtaskListRef} taskId={task.id} subtasks={subtasks} />

      <div className="flex flex-wrap items-center gap-1">
        {scheduledChip && (
          <FieldChip
            label={t('task:scheduledDate')}
            icon={scheduledChip.icon ?? <Calendar />}
            text={scheduledChip.text}
          >
            {(close) => (
              <ScheduledDateField
                current={current}
                onPatch={patch}
                onClose={close}
                showReminder={getClientKind() !== 'web'}
              />
            )}
          </FieldChip>
        )}
        {tags.length > 0 && (
          <FieldChip
            label={t('task:tags')}
            icon={<Tag />}
            text={tags.map((tag) => tag.title).join(', ')}
          >
            <TagsField current={current} onPatch={patch} />
          </FieldChip>
        )}
        {dueDate && (
          <FieldChip
            label={t('task:dueDate')}
            icon={<Flag />}
            text={formatDeadlineCountdown(dueDate)}
            urgent={isOverdue(dueDate) || isToday(dueDate)}
          >
            {(close) => <DueDateField current={current} onPatch={patch} onClose={close} />}
          </FieldChip>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {!scheduledChip && (
            <FieldIconButton
              label={t('task:scheduledDate')}
              icon={<Calendar className="h-4 w-4" />}
            >
              {(close) => (
                <ScheduledDateField
                  current={current}
                  onPatch={patch}
                  onClose={close}
                  showReminder={getClientKind() !== 'web'}
                />
              )}
            </FieldIconButton>
          )}

          {tags.length === 0 && (
            <FieldIconButton label={t('task:tags')} icon={<Tag className="h-4 w-4" />}>
              <TagsField current={current} onPatch={patch} />
            </FieldIconButton>
          )}

          {subtasks.length === 0 && (
            <Hint label={t('task:addSubtask')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
                aria-label={t('task:addSubtask')}
                onClick={(e) => {
                  e.stopPropagation();
                  subtaskListRef.current?.startDraft();
                }}
              >
                <ListPlus className="h-4 w-4" />
              </Button>
            </Hint>
          )}

          {!dueDate && (
            <FieldIconButton label={t('task:dueDate')} icon={<Flag className="h-4 w-4" />}>
              {(close) => <DueDateField current={current} onPatch={patch} onClose={close} />}
            </FieldIconButton>
          )}
        </div>
      </div>
    </div>
  );
}

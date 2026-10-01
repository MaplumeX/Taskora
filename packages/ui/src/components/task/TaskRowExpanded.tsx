import * as React from 'react';
import { Calendar, Flag, ListPlus, Star, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { MarkdownNotesEditor } from '@/components/common/MarkdownNotesEditor';
import { FieldPicker } from '@/components/common/FieldPicker';
import { cn } from '@/lib/utils';
import {
  formatDeadlineCountdown,
  formatShortDate,
  getClientKind,
  isOverdue,
  isToday,
  parseCalendarDate,
  startOfTomorrow,
  useUpdateTask,
} from '@taskora/api';
import { toast } from 'sonner';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { TagsField } from './fields/TagsField';
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

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;

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
  const scheduledChip = (() => {
    if (scheduledType === ScheduledType.SOMEDAY) return { text: t('nav:someday') };
    if (scheduledType !== ScheduledType.DATE || !current.scheduledDate) return null;
    const date = parseCalendarDate(current.scheduledDate);
    const onOrBeforeToday = date < startOfTomorrow();
    const label = onOrBeforeToday ? t('common:today') : formatShortDate(date);
    return {
      text: current.reminderTime ? `${label} ${current.reminderTime}` : label,
      icon: onOrBeforeToday ? <Star className="h-3.5 w-3.5 fill-today text-today" /> : undefined,
    };
  })();
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
            <IconPopover label={t('task:scheduledDate')} icon={<Calendar className="h-4 w-4" />}>
              {(close) => (
                <ScheduledDateField
                  current={current}
                  onPatch={patch}
                  onClose={close}
                  showReminder={getClientKind() !== 'web'}
                />
              )}
            </IconPopover>
          )}

          {tags.length === 0 && (
            <IconPopover label={t('task:tags')} icon={<Tag className="h-4 w-4" />}>
              <TagsField current={current} onPatch={patch} />
            </IconPopover>
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
            <IconPopover label={t('task:dueDate')} icon={<Flag className="h-4 w-4" />}>
              {(close) => <DueDateField current={current} onPatch={patch} onClose={close} />}
            </IconPopover>
          )}
        </div>
      </div>
    </div>
  );
}

/** 已设值字段的 chip：图标 + 值文案，点击打开字段编辑器。 */
function FieldChip({
  label,
  icon,
  text,
  urgent,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  text: string;
  urgent?: boolean;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  return (
    <FieldPicker
      label={label}
      tooltip
      trigger={
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-md bg-muted px-2 text-meta font-medium transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-9 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
            // 图标走 color 继承（默认 muted）；带自身语义色的图标（如今天的黄星）
            // 由 svg 上的 color 类覆盖继承值。文案单独取前景色。
            urgent ? 'text-deadline' : 'text-muted-foreground',
          )}
        >
          {icon}
          <span className={cn('truncate', !urgent && 'text-foreground')}>{text}</span>
        </button>
      }
    >
      {children}
    </FieldPicker>
  );
}

function IconPopover({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  return (
    <FieldPicker
      label={label}
      tooltip
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
          aria-label={label}
        >
          {icon}
        </Button>
      }
    >
      {children}
    </FieldPicker>
  );
}

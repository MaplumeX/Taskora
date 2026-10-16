import * as React from 'react';
import { Calendar, Flag, ListPlus, Paperclip, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { cn } from '@/lib/utils';
import { MarkdownNotesEditor } from '@/components/common/MarkdownNotesEditor';
import {
  getClientKind,
  isOverdue,
  isToday,
  parseCalendarDate,
  useAddAttachmentFiles,
  useUiInteractionStore,
  useUpdateTask,
} from '@taskora/api';
import { toast } from 'sonner';
import { ScheduledDateField, scheduledClearPatch } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { TagsField } from './fields/TagsField';
import { FieldChip, FieldIconButton, deadlineChipText, scheduledChipOf } from './fields/FieldChip';
import { TagCapsule } from './TaskTagCapsules';
import { TaskSubtaskList, type TaskSubtaskListHandle } from './TaskSubtaskList';
import { TaskAttachmentList } from './TaskAttachmentList';

/** 拖进来的是本地文件（而不是列表行等 dnd-kit 拖拽）。 */
function carriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

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
  // ⇧⌘C：新建子任务草稿。等展开时标题框的自动聚焦（rAF）过去再聚焦草稿。
  const subtaskDraftRequested = useUiInteractionStore((s) => s.subtaskDraftTaskId === task.id);
  React.useEffect(() => {
    if (!subtaskDraftRequested) return;
    if (!useUiInteractionStore.getState().takeSubtaskDraft(task.id)) return;
    // 取走请求会让本 effect 重跑，不随之取消（卸载后 ref 为空，调用无效）。
    requestAnimationFrame(() => {
      requestAnimationFrame(() => subtaskListRef.current?.startDraft());
    });
  }, [subtaskDraftRequested, task.id]);
  const attachments = current.attachments ?? [];
  const addAttachmentFiles = useAddAttachmentFiles();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [fileOver, setFileOver] = React.useState(false);

  const attachFiles = (files: File[]) => {
    if (files.length === 0) return;
    addAttachmentFiles(task.id, files).catch(() => toast.error(t('task:attachmentAddFailed')));
  };

  const patch = (data: UpdateTaskDto) =>
    updateTask.mutate(
      { id: task.id, data },
      { onError: () => toast.error(t('common:saveFailed')) },
    );

  const commitNotes = () => {
    if (notes !== (current.notes ?? '')) patch({ notes });
  };

  // 已设值字段在左下纵向排列（点击打开同一编辑器），未设值字段在右下为图标
  // （Things 3 展开任务的底栏）。
  const scheduledChip = scheduledChipOf(current, t);
  const dueDate = current.dueDate ? parseCalendarDate(current.dueDate) : null;
  const tags = current.tags ?? [];
  // 标签可多选：打上第一个 / 去掉最后一个时入口要在图标与标签行之间切换。
  // 选择器打开期间冻结入口（浮层原地不动），关闭后再切换。
  const [tagsAnchor, setTagsAnchor] = React.useState<'row' | 'icon' | null>(null);
  const tagsSlot = tagsAnchor ?? (tags.length > 0 ? 'row' : 'icon');
  const tagsPickerProps = (anchor: 'row' | 'icon') => ({
    open: tagsAnchor === anchor,
    onOpenChange: (open: boolean) => setTagsAnchor(open ? anchor : null),
  });

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md px-2 pb-2 pl-[2.375rem] pt-1 max-md:pl-2',
        fileOver && 'bg-accent/40 ring-1 ring-inset ring-primary/40',
      )}
      onClick={(e) => e.stopPropagation()}
      // 从文件管理器拖入文件即添加为附件（ADR-0019）：原生 HTML5 文件拖放，
      // 与 dnd-kit 的行拖拽（含 Sidebar Drop）互不干扰。
      onDragOver={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setFileOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        setFileOver(false);
        attachFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {fileOver && <span className="text-xs text-primary">{t('task:attachmentDropHint')}</span>}
      <MarkdownNotesEditor
        value={notes}
        onChange={setNotes}
        onBlurCommit={commitNotes}
        placeholder={t('task:notePlaceholder')}
      />

      <TaskSubtaskList ref={subtaskListRef} taskId={task.id} subtasks={subtasks} />

      <TaskAttachmentList taskId={task.id} attachments={attachments} />

      <div className="flex items-end gap-2">
        {/* 已设值字段纵向排列，一行一个（Things 3）。 */}
        <div className="-ml-1.5 flex min-w-0 flex-col items-start gap-0.5">
          {tagsSlot === 'row' && (
            <FieldChip
              label={t('task:tags')}
              {...tagsPickerProps('row')}
              text={tags.map((tag) => (
                <TagCapsule key={tag.id} tag={tag} />
              ))}
              onClear={() => patch({ tagIds: [] })}
            >
              <TagsField current={current} onPatch={patch} />
            </FieldChip>
          )}
          {scheduledChip && (
            <FieldChip
              label={t('task:scheduledDate')}
              icon={scheduledChip.icon ?? <Calendar />}
              text={scheduledChip.text}
              onClear={() => patch(scheduledClearPatch(getClientKind() !== 'web'))}
            >
              {(close) => (
                <ScheduledDateField
                  current={current}
                  onPatch={patch}
                  onClose={close}
                  showReminder={getClientKind() !== 'web'}
                  allowRepeat
                />
              )}
            </FieldChip>
          )}
          {dueDate && (
            <FieldChip
              label={t('task:dueDate')}
              icon={<Flag />}
              text={deadlineChipText(dueDate, t)}
              urgent={isOverdue(dueDate) || isToday(dueDate)}
              onClear={() => patch({ dueDate: null })}
            >
              {(close) => <DueDateField current={current} onPatch={patch} onClose={close} />}
            </FieldChip>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
                  allowRepeat
                />
              )}
            </FieldIconButton>
          )}

          {tagsSlot === 'icon' && (
            <FieldIconButton
              label={t('task:tags')}
              icon={<Tag className="h-4 w-4" />}
              {...tagsPickerProps('icon')}
            >
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

          <Hint label={t('task:addAttachment')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
              aria-label={t('task:addAttachment')}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </Hint>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            data-testid="attachment-file-input"
            onChange={(e) => {
              attachFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />

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

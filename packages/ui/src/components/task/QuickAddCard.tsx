import * as React from 'react';
import { Calendar, Flag, Inbox, Layers, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TagResponseDto } from '@taskora/shared';
import { ScheduledType, TaskBucket } from '@taskora/shared';
import {
  formatDeadlineCountdown,
  getClientKind,
  isOverdue,
  isToday,
  parseCalendarDate,
  startOfToday,
  toInputDateValue,
  useAreasQuery,
  useKeybindingsStore,
  useProjectsQuery,
  useTagsQuery,
  type QuickAddDraft,
} from '@taskora/api';

import { MarkdownNotesEditor } from '@/components/common/MarkdownNotesEditor';
import {
  detectKeyPlatform,
  quickAddShortcutLabel,
  resolveQuickAddAction,
  type QuickAddKeyAction,
} from '@/components/keyboard/keymap';
import { ProjectProgressPie } from '@/components/project/ProjectProgressRing';
import { cn } from '@/lib/utils';
import { DueDateField } from './fields/DueDateField';
import { FieldChip, FieldIconButton, scheduledChipOf } from './fields/FieldChip';
import type { DueDateFieldPatch, ScheduledFieldPatch, TagsFieldPatch } from './fields/fieldProps';
import { MovePicker } from './fields/MovePicker';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { TagsField } from './fields/TagsField';

/** 卡片的草稿状态：字段组件的 current 结构 + 归属。 */
export interface QuickAddCardState {
  title: string;
  notes: string;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  reminderTime: string | null;
  dueDate: string | null;
  tagIds: string[];
  projectId: string | null;
  areaId: string | null;
}

export const EMPTY_QUICK_ADD_STATE: QuickAddCardState = {
  title: '',
  notes: '',
  scheduledType: ScheduledType.NONE,
  scheduledDate: null,
  reminderTime: null,
  dueDate: null,
  tagIds: [],
  projectId: null,
  areaId: null,
};

/**
 * 卡片状态 → QuickAddDraft。只做字段映射；转成 CreateTaskDto 与引用校验
 * 都在共用的 createFromQuickAddDraft 里（quick-add-android spec 第 4 节）。
 */
export function draftFromState(state: QuickAddCardState): QuickAddDraft {
  const draft: QuickAddDraft = { title: state.title.trim() };
  if (state.notes.trim()) draft.notes = state.notes;
  if (state.scheduledType === ScheduledType.DATE && state.scheduledDate) {
    draft.when = { type: 'date', date: state.scheduledDate.slice(0, 10) };
    if (state.reminderTime) draft.reminderTime = state.reminderTime;
  } else if (state.scheduledType === ScheduledType.SOMEDAY) {
    draft.when = { type: 'someday' };
  }
  if (state.dueDate) draft.dueDate = state.dueDate.slice(0, 10);
  if (state.tagIds.length) draft.tagIds = state.tagIds;
  if (state.projectId) draft.projectId = state.projectId;
  else if (state.areaId) draft.areaId = state.areaId;
  return draft;
}

/** 合并字段补丁；离开 DATE 时 Reminder 随之清空（与数据层同一口径）。 */
function applyPatch(
  state: QuickAddCardState,
  patch: ScheduledFieldPatch & DueDateFieldPatch & Partial<TagsFieldPatch>,
): QuickAddCardState {
  const next = { ...state };
  if (patch.scheduledType !== undefined) next.scheduledType = patch.scheduledType;
  if (patch.scheduledDate !== undefined) next.scheduledDate = patch.scheduledDate;
  if (patch.reminderTime !== undefined) next.reminderTime = patch.reminderTime;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.tagIds !== undefined) next.tagIds = patch.tagIds;
  if (next.scheduledType !== ScheduledType.DATE) {
    next.scheduledDate = null;
    next.reminderTime = null;
  }
  return next;
}

/** 可由快捷键打开的选择器。 */
type PickerField = 'when' | 'deadline' | 'tags' | 'move';

export interface QuickAddCardHandle {
  /** 聚焦并全选标题（浮窗每次被唤起时调用）。 */
  focusTitle(): void;
}

interface Props {
  /**
   * 提交草稿。keepOpen 为真时是「添加并继续」：卡片清空字段但保留归属。
   * 抛错时卡片保留草稿，由调用方呈现错误。
   */
  onSubmit: (draft: QuickAddDraft, options: { keepOpen: boolean }) => Promise<void> | void;
  /** Esc：卡片已清空草稿，调用方负责关窗。 */
  onCancel: () => void;
  className?: string;
}

/**
 * Quick Add 草稿卡片（quick-add-v2 issue 03）：版式与展开任务一致——标题、
 * 备注，底栏左侧是已设值字段的 chip，右侧是未设值字段的图标。比展开任务
 * 多一个归属 chip（MovePicker），少了 Subtask / Repeat Rule。
 *
 * 字段编辑只改本地草稿，不写库；提交时交出 QuickAddDraft。
 */
export const QuickAddCard = React.forwardRef<QuickAddCardHandle, Props>(function QuickAddCard(
  { onSubmit, onCancel, className },
  ref,
) {
  const { t } = useTranslation();
  const [state, setState] = React.useState<QuickAddCardState>(EMPTY_QUICK_ADD_STATE);
  const [submitting, setSubmitting] = React.useState(false);
  /** 由快捷键打开的选择器（点击打开时各 FieldPicker 同样经此受控）。 */
  const [openField, setOpenField] = React.useState<PickerField | null>(null);
  const platform = React.useMemo(detectKeyPlatform, []);
  // 用户自定义键位（设置 → 快捷键）；主窗口改绑后经 storage 事件同步到本浮窗。
  const keyOverrides = useKeybindingsStore((s) => s.overrides);
  const keyLabel = (action: QuickAddKeyAction) =>
    quickAddShortcutLabel(action, platform, keyOverrides) ?? undefined;
  const pickerProps = (field: PickerField) => ({
    open: openField === field,
    onOpenChange: (open: boolean) => setOpenField(open ? field : null),
  });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(ref, () => ({
    focusTitle() {
      titleRef.current?.focus();
      titleRef.current?.select();
    },
  }));

  const { data: allTags = [] } = useTagsQuery();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();

  const tags = state.tagIds
    .map((id) => allTags.find((tag) => tag.id === id))
    .filter((tag): tag is TagResponseDto => !!tag);
  const project = state.projectId ? projects.find((p) => p.id === state.projectId) : undefined;
  const area = state.areaId ? areas.find((a) => a.id === state.areaId) : undefined;

  const patch = (data: ScheduledFieldPatch & DueDateFieldPatch & Partial<TagsFieldPatch>) =>
    setState((prev) => applyPatch(prev, data));
  const scheduledCurrent = {
    scheduledType: state.scheduledType,
    scheduledDate: state.scheduledDate,
    reminderTime: state.reminderTime,
  };
  const scheduledChip = scheduledChipOf(scheduledCurrent, t);
  const dueDate = state.dueDate ? parseCalendarDate(state.dueDate) : null;
  const showReminder = getClientKind() !== 'web';

  const submit = async (keepOpen: boolean) => {
    if (submitting || !state.title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(draftFromState(state), { keepOpen });
      setState((prev) =>
        keepOpen
          ? { ...EMPTY_QUICK_ADD_STATE, projectId: prev.projectId, areaId: prev.areaId }
          : EMPTY_QUICK_ADD_STATE,
      );
      if (keepOpen) titleRef.current?.focus();
    } catch {
      // 草稿保留，错误由调用方呈现
    } finally {
      setSubmitting(false);
    }
  };

  // 弹出的选择器在 Portal 里，React 事件仍会冒泡到卡片：只处理卡片自身
  // DOM 内的按键，选择器的 Esc / Enter 留给选择器。
  const ownKey = (e: React.KeyboardEvent) =>
    !e.nativeEvent.isComposing && !!rootRef.current?.contains(e.target as Node);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!ownKey(e) || e.key !== 'Escape') return;
    e.preventDefault();
    setState(EMPTY_QUICK_ADD_STATE);
    onCancel();
  };

  // 卡片快捷键（⌘↵ 提交、⌘S 等字段键）在捕获阶段处理：备注编辑器会截断
  // Enter 的冒泡，Tiptap 也有自己的 Mod 键绑定；捕获阶段拦下后事件不再
  // 下行到编辑器。⌘S 等同时要拦住 webview 的默认行为。
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!ownKey(e)) return;
    const { key, code, metaKey, ctrlKey, altKey, shiftKey } = e;
    const action = resolveQuickAddAction(
      { key, code, metaKey, ctrlKey, altKey, shiftKey },
      platform,
      keyOverrides,
    );
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    switch (action) {
      case 'submit':
      case 'submitAndContinue':
        void submit(action === 'submitAndContinue');
        break;
      case 'today':
        patch({
          scheduledType: ScheduledType.DATE,
          scheduledDate: toInputDateValue(startOfToday()),
        });
        break;
      case 'someday':
        patch({ scheduledType: ScheduledType.SOMEDAY });
        break;
      default:
        setOpenField(action);
    }
  };

  const placement = (() => {
    if (project)
      return {
        icon: (
          <ProjectProgressPie
            total={project.taskTotalCount}
            completed={project.taskCompletedCount}
            projectStatus={project.status}
            size={14}
          />
        ),
        text: project.title || t('project:newItemPlaceholder'),
      };
    if (area) return { icon: <Layers />, text: area.title || t('area:newItemPlaceholder') };
    return { icon: <Inbox className="text-nav-inbox" />, text: t('nav:inbox') };
  })();

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      onKeyDownCapture={onKeyDownCapture}
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 shadow-popover',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* 未完成任务的复选框外观（装饰，不可点）。 */}
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-[4px] border-[1.5px] border-muted-foreground/50"
        />
        <input
          ref={titleRef}
          type="text"
          value={state.title}
          onChange={(e) => {
            const title = e.target.value;
            setState((prev) => ({ ...prev, title }));
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
              e.preventDefault();
              void submit(false);
            }
          }}
          placeholder={t('task:quickAddTitlePlaceholder')}
          aria-label={t('task:quickAddTitlePlaceholder')}
          autoFocus
          className="h-7 min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/70"
        />
      </div>

      <div className="pl-6">
        <MarkdownNotesEditor
          value={state.notes}
          onChange={(notes) => setState((prev) => ({ ...prev, notes }))}
          onBlurCommit={() => undefined}
          placeholder={t('task:notePlaceholder')}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 pl-6">
        <FieldChip
          label={t('task:quickAddPlacement')}
          icon={placement.icon}
          text={placement.text}
          shortcut={keyLabel('move')}
          {...pickerProps('move')}
        >
          {(close) => (
            <MovePicker
              current={{
                projectId: state.projectId,
                areaId: state.areaId,
                // 未选归属时让 Inbox 打勾（MovePicker 按 Inbox 口径判断）。
                bucket: TaskBucket.INBOX,
                scheduledType: ScheduledType.NONE,
              }}
              onSelect={(dto) => {
                // 只取归属：草稿里的计划日期与归属是两个独立字段，选 Inbox
                // 不清计划（MovePicker 的 DTO 面向已有任务的「移入 Inbox」）。
                setState((prev) => ({
                  ...prev,
                  projectId: dto.projectId ?? null,
                  areaId: dto.areaId ?? null,
                }));
                close();
              }}
            />
          )}
        </FieldChip>
        {scheduledChip && (
          <FieldChip
            label={t('task:scheduledDate')}
            icon={scheduledChip.icon ?? <Calendar />}
            text={scheduledChip.text}
            shortcut={keyLabel('when')}
            {...pickerProps('when')}
          >
            {(close) => (
              <ScheduledDateField
                current={scheduledCurrent}
                onPatch={patch}
                onClose={close}
                showReminder={showReminder}
              />
            )}
          </FieldChip>
        )}
        {tags.length > 0 && (
          <FieldChip
            label={t('task:tags')}
            icon={<Tag />}
            text={tags.map((tag) => tag.title).join(', ')}
            shortcut={keyLabel('tags')}
            {...pickerProps('tags')}
          >
            <TagsField current={{ tags }} onPatch={patch} allowCreate={false} />
          </FieldChip>
        )}
        {dueDate && (
          <FieldChip
            label={t('task:dueDate')}
            icon={<Flag />}
            text={formatDeadlineCountdown(dueDate)}
            urgent={isOverdue(dueDate) || isToday(dueDate)}
            shortcut={keyLabel('deadline')}
            {...pickerProps('deadline')}
          >
            {(close) => (
              <DueDateField current={{ dueDate: state.dueDate }} onPatch={patch} onClose={close} />
            )}
          </FieldChip>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {!scheduledChip && (
            <FieldIconButton
              label={t('task:scheduledDate')}
              icon={<Calendar className="h-4 w-4" />}
              shortcut={keyLabel('when')}
              {...pickerProps('when')}
            >
              {(close) => (
                <ScheduledDateField
                  current={scheduledCurrent}
                  onPatch={patch}
                  onClose={close}
                  showReminder={showReminder}
                />
              )}
            </FieldIconButton>
          )}
          {tags.length === 0 && (
            <FieldIconButton
              label={t('task:tags')}
              icon={<Tag className="h-4 w-4" />}
              shortcut={keyLabel('tags')}
              {...pickerProps('tags')}
            >
              <TagsField current={{ tags }} onPatch={patch} allowCreate={false} />
            </FieldIconButton>
          )}
          {!dueDate && (
            <FieldIconButton
              label={t('task:dueDate')}
              icon={<Flag className="h-4 w-4" />}
              shortcut={keyLabel('deadline')}
              {...pickerProps('deadline')}
            >
              {(close) => (
                <DueDateField current={{ dueDate: null }} onPatch={patch} onClose={close} />
              )}
            </FieldIconButton>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pl-6 text-[11px] text-muted-foreground/80">
        <span>
          <kbd className="font-sans">↵</kbd> {t('task:quickAddSubmitHint')}
        </span>
        <span>
          <kbd className="font-sans">{keyLabel('submitAndContinue')}</kbd>{' '}
          {t('task:quickAddContinueHint')}
        </span>
        <span>
          <kbd className="font-sans">Esc</kbd> {t('task:quickAddCloseHint')}
        </span>
      </div>
    </div>
  );
});

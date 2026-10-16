import * as React from 'react';
import { Calendar, Flag, Inbox, Layers, ListPlus, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TagResponseDto } from '@taskora/shared';
import { Start } from '@taskora/shared';
import {
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
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { cn } from '@/lib/utils';
import { DueDateField } from './fields/DueDateField';
import { FieldChip, FieldIconButton, deadlineChipText, scheduledChipOf } from './fields/FieldChip';
import { TagCapsule } from './TaskTagCapsules';
import type { DueDateFieldPatch, ScheduledFieldPatch, TagsFieldPatch } from './fields/fieldProps';
import { MovePicker } from './fields/MovePicker';
import { ScheduledDateField, scheduledClearPatch } from './fields/ScheduledDateField';
import { TagsField } from './fields/TagsField';
import {
  QuickAddSubtaskList,
  type QuickAddSubtask,
  type QuickAddSubtaskListHandle,
} from './QuickAddSubtaskList';

/** 卡片的草稿状态：字段组件的 current 结构 + 归属。 */
export interface QuickAddCardState {
  title: string;
  notes: string;
  /** 开始状态：Someday 或其余（Inbox / Anytime 由归属与日期在数据层推导）。 */
  start: Start;
  scheduledDate: string | null;
  reminderTime: string | null;
  dueDate: string | null;
  tagIds: string[];
  projectId: string | null;
  areaId: string | null;
  subtasks: QuickAddSubtask[];
}

export const EMPTY_QUICK_ADD_STATE: QuickAddCardState = {
  title: '',
  notes: '',
  start: Start.INBOX,
  scheduledDate: null,
  reminderTime: null,
  dueDate: null,
  tagIds: [],
  projectId: null,
  areaId: null,
  subtasks: [],
};

/**
 * 卡片状态 → QuickAddDraft。只做字段映射；转成 CreateTaskDto 与引用校验
 * 都在共用的 createFromQuickAddDraft 里（quick-add-android spec 第 4 节）。
 */
export function draftFromState(state: QuickAddCardState): QuickAddDraft {
  const draft: QuickAddDraft = { title: state.title.trim() };
  if (state.notes.trim()) draft.notes = state.notes;
  if (state.scheduledDate) {
    draft.when = { type: 'date', date: state.scheduledDate.slice(0, 10) };
    if (state.reminderTime) draft.reminderTime = state.reminderTime;
  } else if (state.start === Start.SOMEDAY) {
    draft.when = { type: 'someday' };
  }
  if (state.dueDate) draft.dueDate = state.dueDate.slice(0, 10);
  if (state.tagIds.length) draft.tagIds = state.tagIds;
  if (state.projectId) draft.projectId = state.projectId;
  else if (state.areaId) draft.areaId = state.areaId;
  const subtasks = state.subtasks.map((s) => s.title.trim()).filter(Boolean);
  if (subtasks.length) draft.subtasks = subtasks;
  return draft;
}

/** 合并字段补丁；没有计划日期时 Reminder 随之清空（与数据层同一口径）。 */
function applyPatch(
  state: QuickAddCardState,
  patch: ScheduledFieldPatch & DueDateFieldPatch & Partial<TagsFieldPatch>,
): QuickAddCardState {
  const next = { ...state };
  if (patch.start !== undefined) next.start = patch.start;
  if (patch.scheduledDate !== undefined) next.scheduledDate = patch.scheduledDate;
  if (patch.reminderTime !== undefined) next.reminderTime = patch.reminderTime;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.tagIds !== undefined) next.tagIds = patch.tagIds;
  if (next.start === Start.SOMEDAY) next.scheduledDate = null;
  if (!next.scheduledDate) next.reminderTime = null;
  return next;
}

/** 可由快捷键打开的选择器。 */
type PickerField = 'when' | 'deadline' | 'tags' | 'move';

/** 选择器挂在哪个入口上：已设值的 chip，或未设值的图标按钮。 */
type PickerSlot = 'chip' | 'icon';

/** 提交方式：keepOpen 为「添加并继续」，openInApp 为「在应用中继续」（Android 浮层）。 */
export interface QuickAddSubmitOptions {
  keepOpen: boolean;
  openInApp?: boolean;
}

/** 自定义操作行（触屏）拿到的提交入口。 */
export interface QuickAddCardFooterProps {
  /** 标题非空且不在提交中。 */
  canSubmit: boolean;
  submit: (options: QuickAddSubmitOptions) => void;
}

export interface QuickAddCardHandle {
  /** 聚焦并全选标题（浮窗每次被唤起时调用）。 */
  focusTitle(): void;
  /** 丢弃草稿、关掉选择器（浮窗隐藏后调用，下次唤出是空白卡片）。 */
  reset(): void;
}

interface Props {
  /**
   * 提交草稿。keepOpen 为真时是「添加并继续」：卡片清空字段但保留归属。
   * 抛错时卡片保留草稿，由调用方呈现错误。
   */
  onSubmit: (draft: QuickAddDraft, options: QuickAddSubmitOptions) => Promise<void> | void;
  /** Esc：卡片已清空草稿，调用方负责关窗。 */
  onCancel: () => void;
  /**
   * 替换底部的快捷键提示行（触屏没有键盘快捷键，改放按钮）。不传时为
   * 桌面的提示行。
   */
  footer?: (props: QuickAddCardFooterProps) => React.ReactNode;
  /** 标题里按回车是否「添加并继续」（触屏的连续添加开关）。 */
  keepOpenOnEnter?: boolean;
  className?: string;
}

/**
 * Quick Add 草稿卡片（quick-add-v2 issue 03）：版式与展开任务一致——标题、
 * 备注，底栏左侧是已设值字段的 chip，右侧是未设值字段的图标。比展开任务
 * 多一个归属 chip（MovePicker），少了 Repeat Rule 与附件。
 *
 * 字段编辑只改本地草稿，不写库；提交时交出 QuickAddDraft。
 */
export const QuickAddCard = React.forwardRef<QuickAddCardHandle, Props>(function QuickAddCard(
  { onSubmit, onCancel, footer, keepOpenOnEnter = false, className },
  ref,
) {
  const { t } = useTranslation();
  const [state, setState] = React.useState<QuickAddCardState>(EMPTY_QUICK_ADD_STATE);
  const [submitting, setSubmitting] = React.useState(false);
  /** 由快捷键打开的选择器（点击打开时各 FieldPicker 同样经此受控）。 */
  const [openField, setOpenField] = React.useState<{
    field: PickerField;
    slot: PickerSlot;
  } | null>(null);
  const platform = React.useMemo(detectKeyPlatform, []);
  // 用户自定义键位（设置 → 快捷键）；主窗口改绑后经 storage 事件同步到本浮窗。
  const keyOverrides = useKeybindingsStore((s) => s.overrides);
  const keyLabel = (action: QuickAddKeyAction) =>
    quickAddShortcutLabel(action, platform, keyOverrides) ?? undefined;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const subtaskListRef = React.useRef<QuickAddSubtaskListHandle>(null);

  React.useImperativeHandle(ref, () => ({
    focusTitle() {
      titleRef.current?.focus();
      titleRef.current?.select();
    },
    reset() {
      setState(EMPTY_QUICK_ADD_STATE);
      setOpenField(null);
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
    start: state.start,
    scheduledDate: state.scheduledDate,
    reminderTime: state.reminderTime,
  };
  const scheduledChip = scheduledChipOf(scheduledCurrent, t);
  const dueDate = state.dueDate ? parseCalendarDate(state.dueDate) : null;
  const showReminder = getClientKind() !== 'web';

  const slotOf = (field: PickerField): PickerSlot => {
    if (field === 'when') return scheduledChip ? 'chip' : 'icon';
    if (field === 'tags') return tags.length > 0 ? 'chip' : 'icon';
    if (field === 'deadline') return dueDate ? 'chip' : 'icon';
    return 'chip';
  };
  // 与展开任务一致：从图标按钮设上值后，入口换成字段行，单选字段的选择器
  // 随旧入口一起关闭。Tag 可多选：打开期间冻结入口（浮层原地不动），关闭后再切换。
  if (openField && openField.field !== 'tags' && openField.slot !== slotOf(openField.field)) {
    setOpenField(null);
  }
  const tagsSlot = openField?.field === 'tags' ? openField.slot : slotOf('tags');
  const pickerProps = (field: PickerField, slot: PickerSlot) => ({
    open: openField?.field === field && openField.slot === slot,
    onOpenChange: (open: boolean) => setOpenField(open ? { field, slot } : null),
  });

  const canSubmit = !submitting && !!state.title.trim();
  const submit = async (options: QuickAddSubmitOptions) => {
    if (!canSubmit) return;
    const { keepOpen } = options;
    setSubmitting(true);
    try {
      await onSubmit(draftFromState(state), options);
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
        void submit({ keepOpen: action === 'submitAndContinue' });
        break;
      case 'today':
        patch({
          start: Start.ANYTIME,
          scheduledDate: toInputDateValue(startOfToday()),
        });
        break;
      case 'someday':
        patch({ start: Start.SOMEDAY });
        break;
      default:
        setOpenField({ field: action, slot: slotOf(action) });
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
            start={project.start}
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
              void submit({ keepOpen: keepOpenOnEnter });
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
        <QuickAddSubtaskList
          ref={subtaskListRef}
          subtasks={state.subtasks}
          onChange={(subtasks) => setState((prev) => ({ ...prev, subtasks }))}
        />
      </div>

      <div className="flex items-end gap-2 pl-6">
        {/* 已设值字段纵向排列，一行一个（Things 3）。 */}
        <div className="-ml-1.5 flex min-w-0 flex-col items-start gap-0.5">
          <FieldChip
            label={t('task:quickAddPlacement')}
            icon={placement.icon}
            text={placement.text}
            {...pickerProps('move', 'chip')}
          >
            {(close) => (
              <MovePicker
                current={{
                  projectId: state.projectId,
                  areaId: state.areaId,
                  // 未选归属时让 Inbox 打勾（MovePicker 按 Inbox 口径判断）。
                  start: Start.INBOX,
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
          {tagsSlot === 'chip' && (
            <FieldChip
              label={t('task:tags')}
              text={tags.map((tag) => (
                <TagCapsule key={tag.id} tag={tag} />
              ))}
              onClear={() => patch({ tagIds: [] })}
              {...pickerProps('tags', 'chip')}
            >
              <TagsField current={{ tags }} onPatch={patch} allowCreate={false} />
            </FieldChip>
          )}
          {scheduledChip && (
            <FieldChip
              label={t('task:scheduledDate')}
              icon={scheduledChip.icon ?? <Calendar />}
              text={scheduledChip.text}
              onClear={() => patch(scheduledClearPatch(showReminder))}
              {...pickerProps('when', 'chip')}
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
          {dueDate && (
            <FieldChip
              label={t('task:dueDate')}
              icon={<Flag />}
              text={deadlineChipText(dueDate, t)}
              urgent={isOverdue(dueDate) || isToday(dueDate)}
              onClear={() => patch({ dueDate: null })}
              {...pickerProps('deadline', 'chip')}
            >
              {(close) => (
                <DueDateField
                  current={{ dueDate: state.dueDate }}
                  onPatch={patch}
                  onClose={close}
                />
              )}
            </FieldChip>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {!scheduledChip && (
            <FieldIconButton
              label={t('task:scheduledDate')}
              icon={<Calendar className="h-4 w-4" />}
              shortcut={keyLabel('when')}
              {...pickerProps('when', 'icon')}
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
          {tagsSlot === 'icon' && (
            <FieldIconButton
              label={t('task:tags')}
              icon={<Tag className="h-4 w-4" />}
              shortcut={keyLabel('tags')}
              {...pickerProps('tags', 'icon')}
            >
              <TagsField current={{ tags }} onPatch={patch} allowCreate={false} />
            </FieldIconButton>
          )}
          {state.subtasks.length === 0 && (
            <Hint label={t('task:addSubtask')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
                aria-label={t('task:addSubtask')}
                onClick={() => subtaskListRef.current?.startDraft()}
              >
                <ListPlus className="h-4 w-4" />
              </Button>
            </Hint>
          )}
          {!dueDate && (
            <FieldIconButton
              label={t('task:dueDate')}
              icon={<Flag className="h-4 w-4" />}
              shortcut={keyLabel('deadline')}
              {...pickerProps('deadline', 'icon')}
            >
              {(close) => (
                <DueDateField current={{ dueDate: null }} onPatch={patch} onClose={close} />
              )}
            </FieldIconButton>
          )}
        </div>
      </div>

      {footer ? (
        footer({ canSubmit, submit: (options) => void submit(options) })
      ) : (
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
      )}
    </div>
  );
});

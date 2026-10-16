import {
  useCalendarDay,
  parseCalendarDate,
  toInputDateValue,
  usePreferencesStore,
  startOfToday,
  startOfTomorrow,
  isToday,
  isTomorrow,
  useReminderPermissionStore,
} from '@taskora/api';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Star, Sunrise } from 'lucide-react';

import type { ScheduledFieldCurrent, ScheduledFieldPatch } from './fieldProps';
import { Start, type WhenCandidate } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { TimePicker } from '@/components/ui/time-picker';

import { getCalendarLocale } from './calendarFieldUtils';
import { DateShortcutList } from './DateShortcutList';
import { WhenQueryInput } from './WhenQueryInput';

/**
 * 清除计划：落 Anytime（对齐 Things 3 的 Clear），无归属的任务也不回 Inbox。
 * 编辑器的「清除」与 chip 上的 × 共用。
 */
export function scheduledClearPatch(showReminder?: boolean): ScheduledFieldPatch {
  const clear: ScheduledFieldPatch = { start: Start.ANYTIME, scheduledDate: null };
  if (showReminder) clear.reminderTime = null;
  return clear;
}

interface FieldProps {
  current: ScheduledFieldCurrent;
  onPatch: (data: ScheduledFieldPatch) => void;
  onClose?: () => void;
  /**
   * 提醒区开关（reminders spec）：TaskRowExpanded 传 true（Desktop/
   * Mobile），ProjectMetaRow 不传（Project 不设 Reminder；web 前端
   * 本版无通知能力，同样不传）。
   */
  showReminder?: boolean;
  /**
   * 输入框识别重复说法（recurring-tasks-v3 Repeat Query）：只在单个 Task /
   * Project 的入口打开，多选、批量改期等不传。
   */
  allowRepeat?: boolean;
}

/** 首次开启提醒的默认时刻（spec：固定 09:00，非偏好项）。 */
export const DEFAULT_REMINDER_TIME = '09:00';

export function ScheduledDateField({
  current,
  onPatch,
  onClose,
  showReminder = false,
  allowRepeat = false,
}: FieldProps) {
  useCalendarDay();
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const permission = useReminderPermissionStore((s) => s.permission);
  const permissionSupported = useReminderPermissionStore((s) => s.supported);
  const requestPermission = useReminderPermissionStore((s) => s.request);
  const refreshPermission = useReminderPermissionStore((s) => s.refresh);
  const openNotificationSettings = useReminderPermissionStore((s) => s.openSettings);

  const someday = current.start === Start.SOMEDAY;
  const storedDate =
    !someday && current.scheduledDate ? parseCalendarDate(current.scheduledDate) : undefined;
  // 参考 Things 3：计划日期已过按「今天」对待——卡片选中今天，数据层
  // 日期不改写；只有在卡片里写提醒时才把计划日期一并落为今天。
  const pastDate = storedDate !== undefined && storedDate < startOfToday();
  const selectedDate = pastDate ? startOfToday() : storedDate;

  const locale = getCalendarLocale(i18n.language);

  // 提醒区只在有计划日期的任务上出现（Someday / 无计划任务的提醒无法成立）。
  const reminderVisible = showReminder && storedDate !== undefined;

  // 提醒区打开时对齐一次系统授权状态（拒绝过的会话要能展示禁用提示）。
  React.useEffect(() => {
    if (reminderVisible) void refreshPermission();
  }, [reminderVisible, refreshPermission]);

  // 可设提醒的端（Desktop / Mobile）：选定日期后不关闭，提醒区就地出现，
  // 接着即可设提醒（Things 3 的 When 卡片同样常驻「添加提醒」）。无提醒的
  // 上下文（web / Project）选完即关。Someday / 清除不涉及提醒，照常关闭。
  const closeAfterDate = () => {
    if (!showReminder) onClose?.();
  };

  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    onPatch({ start: Start.ANYTIME, scheduledDate: toInputDateValue(date) });
    closeAfterDate();
  };

  const handleToday = () => {
    onPatch({ start: Start.ANYTIME, scheduledDate: toInputDateValue(startOfToday()) });
    closeAfterDate();
  };

  const handleTomorrow = () => {
    onPatch({ start: Start.ANYTIME, scheduledDate: toInputDateValue(startOfTomorrow()) });
    closeAfterDate();
  };

  const handleSomeday = () => {
    // 清除日期时的清理（reminderTime / repeatRule）由数据层强制；
    // Task 上下文显式携带 reminderTime null 让提醒语义即时生效，
    // repeatRule 由独立的 RepeatRuleField 入口负责（数据层兜底清除）。
    const clear: ScheduledFieldPatch = {};
    if (showReminder) clear.reminderTime = null;
    onPatch({ start: Start.SOMEDAY, ...clear });
    onClose?.();
  };

  const handleClear = () => {
    onPatch(scheduledClearPatch(showReminder));
    onClose?.();
  };

  // 提醒 = 计划日 + 时刻（Things 3：提醒经 When 设置）。日期已过时一并
  // 写入今天，否则提醒落在过去、永不触发。
  const rollPastDateToToday = (): ScheduledFieldPatch =>
    pastDate ? { scheduledDate: toInputDateValue(startOfToday()) } : {};

  const handleReminderToggle = (checked: boolean) => {
    if (checked) {
      // 首次开启提醒时请求通知授权（spec：不在 App 启动时请求）；
      // 拒绝后仍保存 reminderTime，仅提示通知被禁用。
      void requestPermission();
      onPatch({
        ...rollPastDateToToday(),
        reminderTime: current.reminderTime ?? DEFAULT_REMINDER_TIME,
      });
    } else {
      onPatch({ reminderTime: null });
    }
  };

  const handleReminderTimeChange = (value: string) => {
    if (!value) return; // 清空中间态不产生写
    onPatch({ ...rollPastDateToToday(), reminderTime: value });
  };

  // 自然语言输入：选中即关闭（时刻可一并输入，不必停留设提醒）。带时刻
  // 的候选只在可设提醒的上下文出现，等同开启提醒，一并请求通知授权。
  const handleQuerySelect = (candidate: WhenCandidate) => {
    if (candidate.kind === 'someday') return handleSomeday();
    if (candidate.kind === 'clear') return handleClear();
    const patch: ScheduledFieldPatch = { start: Start.ANYTIME, scheduledDate: candidate.date };
    // 重复说法：计划到第一次出现日，并写入规则（覆盖已有规则）
    if (candidate.kind === 'repeat') patch.repeatRule = candidate.rule;
    if (showReminder && candidate.time) {
      void requestPermission();
      patch.reminderTime = candidate.time;
    }
    onPatch(patch);
    onClose?.();
  };

  return (
    <WhenQueryInput
      placeholder={t(allowRepeat ? 'task:whenQueryRepeatPlaceholder' : 'task:whenQueryPlaceholder')}
      allowSomeday
      allowRepeat={allowRepeat}
      showTime={showReminder}
      todayIcon={<Star className="fill-today text-today" />}
      onSelect={handleQuerySelect}
    >
      <DateShortcutList
        items={[
          {
            key: 'today',
            label: t('common:today'),
            icon: <Star className="fill-today text-today" />,
            active: selectedDate !== undefined && isToday(selectedDate),
            onSelect: handleToday,
          },
          {
            key: 'tomorrow',
            label: t('common:tomorrow'),
            icon: <Sunrise className="text-nav-upcoming" />,
            active: selectedDate !== undefined && isTomorrow(selectedDate),
            onSelect: handleTomorrow,
          },
          {
            key: 'someday',
            label: t('task:somedayLabel'),
            icon: <Archive className="text-nav-someday" />,
            active: someday,
            onSelect: handleSomeday,
          },
        ]}
        clear={{
          label: t('common:clear'),
          disabled: !someday && storedDate === undefined,
          onClear: handleClear,
        }}
      />
      <Calendar
        selected={selectedDate}
        onSelect={handleDaySelect}
        locale={locale}
        weekStartsOn={weekStartsOn}
      />
      {reminderVisible && (
        <div
          className="flex items-center gap-2 border-t border-border/50 px-2 py-1.5 max-md:py-2.5"
          data-reminder-section
        >
          <span className="select-none text-sm max-md:text-[15px]">{t('task:reminder')}</span>
          <TimePicker
            aria-label={t('task:reminderTime')}
            hourLabel={t('task:reminderHour')}
            minuteLabel={t('task:reminderMinute')}
            className="ml-auto"
            value={current.reminderTime ?? DEFAULT_REMINDER_TIME}
            disabled={current.reminderTime == null}
            onChange={handleReminderTimeChange}
          />
          <Switch
            aria-label={t('task:reminder')}
            checked={current.reminderTime != null}
            onCheckedChange={handleReminderToggle}
          />
        </div>
      )}
      {reminderVisible && permissionSupported && permission === 'denied' && (
        <div className="flex items-center gap-2 border-t border-border/50 px-2 py-1.5 text-xs text-muted-foreground">
          <span>{t('task:reminderDisabledNotice')}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => void openNotificationSettings()}
          >
            {t('task:reminderOpenSettings')}
          </Button>
        </div>
      )}
    </WhenQueryInput>
  );
}

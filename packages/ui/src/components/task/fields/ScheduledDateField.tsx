import {
  useCalendarDay,
  parseCalendarDate,
  toInputDateValue,
  usePreferencesStore,
  startOfToday,
  startOfTomorrow,
  isOverdue,
  isToday,
  isTomorrow,
  useReminderPermissionStore,
} from '@taskora/api';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Star, Sunrise } from 'lucide-react';

import type { ScheduledFieldCurrent, ScheduledFieldPatch } from './fieldProps';
import { ScheduledType } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { TimePicker } from '@/components/ui/time-picker';
import { cn } from '@/lib/utils';

import { getCalendarLocale } from './calendarFieldUtils';
import { DateShortcutList } from './DateShortcutList';

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
}

/** 首次开启提醒的默认时刻（spec：固定 09:00，非偏好项）。 */
export const DEFAULT_REMINDER_TIME = '09:00';

/**
 * 底部快捷按钮：宽屏收窄内边距（四个英文按钮在 w-72 popover 内放得下），
 * 窄屏（居中卡片）放大到触控尺寸。
 */
export const FOOTER_BUTTON_CLASS = 'px-2 max-md:h-10 max-md:px-3 max-md:text-sm';

export function ScheduledDateField({
  current,
  onPatch,
  onClose,
  showReminder = false,
}: FieldProps) {
  useCalendarDay();
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const permission = useReminderPermissionStore((s) => s.permission);
  const permissionSupported = useReminderPermissionStore((s) => s.supported);
  const requestPermission = useReminderPermissionStore((s) => s.request);
  const refreshPermission = useReminderPermissionStore((s) => s.refresh);
  const openNotificationSettings = useReminderPermissionStore((s) => s.openSettings);

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;
  const storedDate =
    scheduledType === ScheduledType.DATE && current.scheduledDate
      ? parseCalendarDate(current.scheduledDate)
      : undefined;
  // 参考 Things 3：计划日期已过按「今天」对待——卡片选中今天，数据层
  // 日期不改写；只有在卡片里写提醒时才把计划日期一并落为今天。
  const pastDate = storedDate !== undefined && isOverdue(storedDate);
  const selectedDate = pastDate ? startOfToday() : storedDate;

  const locale = getCalendarLocale(i18n.language);

  // 提醒区只在 DATE 型任务上出现（Someday / 无计划任务的提醒无法成立）。
  const reminderVisible = showReminder && scheduledType === ScheduledType.DATE;

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
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: toInputDateValue(date),
    });
    closeAfterDate();
  };

  const handleToday = () => {
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: toInputDateValue(startOfToday()),
    });
    closeAfterDate();
  };

  const handleTomorrow = () => {
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: toInputDateValue(startOfTomorrow()),
    });
    closeAfterDate();
  };

  const handleSomeday = () => {
    // 离开 DATE 时清理（reminderTime / repeatRule）由数据层强制；
    // Task 上下文显式携带 reminderTime null 让提醒语义即时生效，
    // repeatRule 由独立的 RepeatRuleField 入口负责（数据层兜底清除）。
    const clear: ScheduledFieldPatch = {};
    if (showReminder) clear.reminderTime = null;
    onPatch({ scheduledType: ScheduledType.SOMEDAY, ...clear });
    onClose?.();
  };

  const handleClear = () => {
    const clear: ScheduledFieldPatch = {};
    if (showReminder) clear.reminderTime = null;
    onPatch({ scheduledType: ScheduledType.NONE, scheduledDate: null, ...clear });
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

  return (
    <div className="flex flex-col">
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
            active: scheduledType === ScheduledType.SOMEDAY,
            onSelect: handleSomeday,
          },
        ]}
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
      <div className="flex items-center border-t border-border/50 px-1 pt-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={scheduledType === ScheduledType.NONE}
          onClick={handleClear}
          className={cn('w-full', FOOTER_BUTTON_CLASS)}
        >
          {t('common:clear')}
        </Button>
      </div>
    </div>
  );
}

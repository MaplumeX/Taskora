import React from 'react';
import { useTranslation } from 'react-i18next';

import type { ScheduledFieldCurrent, ScheduledFieldPatch } from './fieldProps';
import { ScheduledType } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { startOfToday } from '@taskora/api';
import { usePreferencesStore, useReminderPermissionStore } from '@taskora/api';

import { getCalendarLocale, startOfLocalDay } from './calendarFieldUtils';

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

export function ScheduledDateField({
  current,
  onPatch,
  onClose,
  showReminder = false,
}: FieldProps) {
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const permission = useReminderPermissionStore((s) => s.permission);
  const permissionSupported = useReminderPermissionStore((s) => s.supported);
  const requestPermission = useReminderPermissionStore((s) => s.request);
  const refreshPermission = useReminderPermissionStore((s) => s.refresh);
  const openNotificationSettings = useReminderPermissionStore((s) => s.openSettings);

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;  const selectedDate =
    scheduledType === ScheduledType.DATE && current.scheduledDate
      ? new Date(current.scheduledDate)
      : undefined;

  const locale = getCalendarLocale(i18n.language);

  // 提醒区只在 DATE 型任务上出现（Someday / 无计划任务的提醒无法成立）。
  const reminderVisible = showReminder && scheduledType === ScheduledType.DATE;

  // 提醒区打开时对齐一次系统授权状态（拒绝过的会话要能展示禁用提示）。
  React.useEffect(() => {
    if (reminderVisible) void refreshPermission();
  }, [reminderVisible, refreshPermission]);

  const handleDaySelect = (date: Date | undefined) => {
    if (!date) return;
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: startOfLocalDay(date).toISOString(),
    });
    onClose?.();
  };

  const handleToday = () => {
    onPatch({
      scheduledType: ScheduledType.DATE,
      scheduledDate: startOfToday().toISOString(),
    });
    onClose?.();
  };

  const handleSomeday = () => {
    // 离开 DATE 时清理规则由数据层强制（reminderTime 置 null）；Task
    // 上下文显式携带 null 让语义即时生效，Project 上下文不携带（无此字段）。
    onPatch(
      showReminder
        ? { scheduledType: ScheduledType.SOMEDAY, reminderTime: null }
        : { scheduledType: ScheduledType.SOMEDAY },
    );
    onClose?.();
  };

  const handleClear = () => {
    onPatch(
      showReminder
        ? { scheduledType: ScheduledType.NONE, scheduledDate: null, reminderTime: null }
        : { scheduledType: ScheduledType.NONE, scheduledDate: null },
    );
    onClose?.();
  };

  const handleReminderToggle = (checked: boolean) => {
    if (checked) {
      // 首次开启提醒时请求通知授权（spec：不在 App 启动时请求）；
      // 拒绝后仍保存 reminderTime，仅提示通知被禁用。
      void requestPermission();
      onPatch({ reminderTime: current.reminderTime ?? DEFAULT_REMINDER_TIME });
    } else {
      onPatch({ reminderTime: null });
    }
  };

  const handleReminderTimeChange = (value: string) => {
    if (!value) return; // 清空中间态不产生写
    onPatch({ reminderTime: value });
  };

  return (
    <div className="flex flex-col">
      <Calendar
        selected={selectedDate}
        onSelect={handleDaySelect}
        locale={locale}
        weekStartsOn={weekStartsOn}
      />
      {reminderVisible && (
        <div
          className="flex items-center gap-2 border-t border-border/50 px-2 py-1.5"
          data-reminder-section
        >
          <input
            type="checkbox"
            role="switch"
            aria-label={t('task:reminder')}
            className="h-4 w-4 accent-primary"
            checked={current.reminderTime != null}
            onChange={(e) => handleReminderToggle(e.target.checked)}
          />
          <span className="select-none text-sm">{t('task:reminder')}</span>
          <input
            type="time"
            aria-label={t('task:reminderTime')}
            className="h-7 rounded-md border border-input bg-transparent px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            value={current.reminderTime ?? ''}
            disabled={current.reminderTime == null}
            onChange={(e) => handleReminderTimeChange(e.target.value)}
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
      <div className="flex items-center gap-1 border-t border-border/50 p-2">
        <Button variant="ghost" size="sm" onClick={handleToday}>
          {t('common:today')}
        </Button>
        <Button
          variant={scheduledType === ScheduledType.SOMEDAY ? 'secondary' : 'ghost'}
          size="sm"
          onClick={handleSomeday}
        >
          {t('task:somedayLabel')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={scheduledType === ScheduledType.NONE}
          onClick={handleClear}
          className="ml-auto"
        >
          {t('common:clear')}
        </Button>
      </div>
    </div>
  );
}

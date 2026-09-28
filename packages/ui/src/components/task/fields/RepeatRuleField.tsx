import {
  useCalendarDay,
  nextOccurrenceDate,
  normalizeRepeatRule,
  currentLegacyDateTimeZone,
  parseCalendarDate,
  toInputDateValue,
  usePreferencesStore,
} from '@taskora/api';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { ScheduledFieldCurrent, ScheduledFieldPatch } from './fieldProps';
import { RepeatUnit } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';

import { getCalendarLocale } from './calendarFieldUtils';

/** 首次开启重复的默认规则（spec 未规定缺省）：每周、从计划日期算。 */
export const DEFAULT_REPEAT_RULE = {
  unit: 'week',
  interval: 1,
  anchor: 'scheduled',
} as const;

interface FieldProps {
  current: ScheduledFieldCurrent;
  onPatch: (data: ScheduledFieldPatch) => void;
}

const REPEAT_UNITS: RepeatUnit[] = ['day', 'week', 'month', 'year'];

/**
 * 重复规则独立编辑字段（recurring-tasks spec）：单位选择、「每 N」步进器、
 * 周模式星期按钮、「从完成日期算」锚点开关、可选 until 日期，以及「下次」
 * 实时预览（纯函数 nextOccurrenceDate 计算，保存前即可验证规则）。
 *
 * 与 ScheduledDateField 平级的独立入口（不内嵌于计划 popover）：入口仅在
 * DATE 型任务上出现（规则必须有计划日期作锚点）；离开 DATE 时规则由数据
 * 层强制清除。每次交互立即 patch 完整规则；规则归一化由数据层在写入时
 * 完成（normalizeRepeatRule），预览用同一函数保持口径一致。
 */
export function RepeatRuleField({ current, onPatch }: FieldProps) {
  useCalendarDay();
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const timeZone = usePreferencesStore((s) => s.timeZone);

  const rule = normalizeRepeatRule(current.repeatRule);

  const patchRule = (next: ScheduledFieldPatch['repeatRule']) => {
    onPatch({ repeatRule: next });
  };

  // 星期按钮顺序跟随周起始偏好（仅展示顺序；规则的周期对齐固定 ISO 周一）
  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);
  const weekdayLabel = (day: number) => {
    // 2023-01-01 是周日（day=0），用真实日期取窄格式标签避免手写映射
    const date = new Date(2023, 0, 1 + day);
    return new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' }).format(date);
  };
  const weekdayFullLabel = (day: number) => {
    const date = new Date(2023, 0, 1 + day);
    return new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(date);
  };

  const toggleWeekday = (day: number) => {
    if (!rule) return;
    const weekdays = rule.weekdays ?? [];
    const next = weekdays.includes(day)
      ? weekdays.filter((d) => d !== day)
      : [...weekdays, day].sort((a, b) => a - b);
    patchRule({ ...rule, weekdays: next });
  };

  const changeUnit = (unit: RepeatUnit) => {
    if (!rule || unit === rule.unit) return;
    // 离开 week 单位时剥离 weekdays（数据层归一化也会剥，这里保持 UI 即时一致）
    const next = { ...rule, unit };
    if (unit !== 'week') delete next.weekdays;
    patchRule(next);
  };

  const changeInterval = (delta: number) => {
    if (!rule) return;
    const next = Math.min(999, Math.max(1, rule.interval + delta));
    if (next === rule.interval) return;
    patchRule({ ...rule, interval: next });
  };

  const toggleAnchor = (checked: boolean) => {
    if (!rule) return;
    patchRule({ ...rule, anchor: checked ? 'completion' : 'scheduled' });
  };

  const changeUntil = (value: string) => {
    if (!rule) return;
    // 空值清除 until（链无限延续）；否则携带（归一化取日期部分）
    const next = { ...rule };
    if (value) next.until = value;
    else delete next.until;
    patchRule(next);
  };

  // 实时预览：anchor=completion 按「今天完成」预览；until 已过则显示终结
  const previewDate = rule
    ? nextOccurrenceDate(rule, {
        scheduledDate: current.scheduledDate ?? null,
        timeZone,
        legacyDateTimeZone: currentLegacyDateTimeZone(),
        settledAt: rule.anchor === 'completion' ? new Date().toISOString() : null,
      })
    : null;
  const previewLabel = previewDate
    ? new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      }).format(parseCalendarDate(previewDate))
    : null;

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 max-md:gap-3 max-md:py-2" data-repeat-section>
      <div className="flex items-center gap-2">
        <span className="select-none text-sm max-md:text-[15px]">{t('task:repeat')}</span>
        <Switch
          aria-label={t('task:repeat')}
          className="ml-auto"
          checked={rule != null}
          onCheckedChange={(checked) => patchRule(checked ? { ...DEFAULT_REPEAT_RULE } : null)}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5" aria-label={t('task:repeatInterval')}>
          <span className="mr-1 select-none text-xs text-muted-foreground max-md:text-sm">
            {t('task:repeatEvery')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 px-0 max-md:h-10 max-md:w-10 max-md:text-base"
            aria-label={t('task:repeatIntervalMinus')}
            disabled={!rule || rule.interval <= 1}
            onClick={() => changeInterval(-1)}
          >
            −
          </Button>
          <span className="w-6 select-none text-center text-sm tabular-nums">
            {rule?.interval ?? 1}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 px-0 max-md:h-10 max-md:w-10 max-md:text-base"
            aria-label={t('task:repeatIntervalPlus')}
            disabled={!rule || rule.interval >= 999}
            onClick={() => changeInterval(1)}
          >
            +
          </Button>
        </div>
        <div
          role="radiogroup"
          aria-label={t('task:repeatUnit')}
          className="ml-auto flex rounded-md bg-muted p-0.5 max-md:flex-1"
        >
          {REPEAT_UNITS.map((unit) => {
            const active = (rule?.unit ?? 'week') === unit;
            return (
              <button
                key={unit}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!rule}
                onClick={() => changeUnit(unit)}
                className={
                  'h-6 min-w-8 rounded-[5px] px-1.5 text-xs select-none transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 max-md:h-9 max-md:flex-1 max-md:text-sm ' +
                  (active
                    ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.12)]'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                {t(`task:repeatUnit-${unit}`)}
              </button>
            );
          })}
        </div>
      </div>

      {rule?.unit === 'week' && (
        <div className="flex items-center gap-1 max-md:gap-1.5" role="group" aria-label={t('task:repeatWeekdays')}>
          {weekdayOrder.map((day) => {
            const active = rule.weekdays?.includes(day) ?? false;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                aria-label={weekdayFullLabel(day)}
                disabled={!rule}
                onClick={() => toggleWeekday(day)}
                className={
                  'h-6 w-6 rounded-md border text-xs select-none disabled:opacity-50 max-md:h-10 max-md:w-auto max-md:flex-1 max-md:text-sm ' +
                  (active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input text-muted-foreground hover:bg-accent')
                }
              >
                {weekdayLabel(day)}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 max-md:gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground max-md:min-h-10 max-md:gap-2 max-md:text-sm">
          <Checkbox
            className="max-md:h-5 max-md:w-5"
            checked={rule?.anchor === 'completion'}
            disabled={!rule}
            onCheckedChange={(checked) => toggleAnchor(checked === true)}
          />
          {t('task:repeatAfterCompletion')}
        </label>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground max-md:gap-2 max-md:text-sm">
          <span className="select-none">{t('task:repeatUntil')}</span>
          <UntilPicker
            value={rule?.until ?? null}
            disabled={!rule}
            onChange={changeUntil}
          />
        </div>
      </div>

      {rule && current.scheduledDate && (
        <p className="text-xs text-muted-foreground max-md:text-sm" data-repeat-preview>
          {previewLabel
            ? t('task:repeatNextPreview', { date: previewLabel })
            : t('task:repeatEnded')}
        </p>
      )}
    </div>
  );
}

/** 「直到」日期：trigger 显示日期（未设为「无」），点开为日历 + 清除。 */
function UntilPicker({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseCalendarDate(value) : undefined;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('task:repeatUntil')}
          disabled={disabled}
          className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-xs tabular-nums text-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-sidebar-accent max-md:h-9 max-md:px-3 max-md:text-sm"
        >
          {selected
            ? new Intl.DateTimeFormat(i18n.language, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              }).format(selected)
            : t('common:none')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="bg-popover p-1.5 backdrop-blur-none max-md:p-1.5">
        <Calendar
          selected={selected}
          onSelect={(date) => date && pick(toInputDateValue(date))}
          locale={getCalendarLocale(i18n.language)}
          weekStartsOn={weekStartsOn}
        />
        <div className="flex border-t border-border/50 px-1 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto max-md:h-10 max-md:px-3 max-md:text-sm"
            disabled={!value}
            onClick={() => pick('')}
          >
            {t('common:clear')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

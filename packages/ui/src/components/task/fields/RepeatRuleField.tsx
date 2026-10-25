import {
  useCalendarDay,
  nextOccurrenceDate,
  normalizeRepeatRule,
  currentLegacyDateTimeZone,
  parseCalendarDate,
  toInputDateValue,
  usePreferencesStore,
} from '@taskora/api';
import { Check, ChevronDown, ChevronRight, Repeat } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { ScheduledFieldCurrent, ScheduledFieldPatch } from './fieldProps';
import type { RepeatRule, RepeatUnit } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { getCalendarLocale } from './calendarFieldUtils';
import { formatMonthDays } from './repeatSummary';

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
/** 与引擎 normalizeRepeatRule 的上限一致。 */
const MAX_INTERVAL = 999;
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** 关闭状态下的一键预设（均为按日程）。 */
const PRESETS: { key: string; rule: RepeatRule }[] = [
  { key: 'task:repeatSummaryOne-day', rule: { unit: 'day', interval: 1, anchor: 'scheduled' } },
  {
    key: 'task:repeatPresetWeekdays',
    rule: { unit: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5], anchor: 'scheduled' },
  },
  { key: 'task:repeatSummaryOne-week', rule: { ...DEFAULT_REPEAT_RULE } },
  { key: 'task:repeatSummaryOne-month', rule: { unit: 'month', interval: 1, anchor: 'scheduled' } },
  { key: 'task:repeatSummaryOne-year', rule: { unit: 'year', interval: 1, anchor: 'scheduled' } },
];

/** 单位分段控件的段。 */
const segmentClass = (active: boolean) =>
  cn(
    'h-6 flex-1 whitespace-nowrap rounded-[5px] px-1.5 text-xs select-none transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-9 max-md:text-sm',
    active
      ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.12)]'
      : 'text-muted-foreground hover:text-foreground',
  );

/**
 * 重复规则独立编辑字段（recurring-tasks spec）。
 *
 * 两种模式隔离（间隔行前缀即模式下拉，不常驻一整行）：
 * - 按日程（anchor=scheduled）：「每 N 单位」+ 周模式星期条 / 月模式日子网格；
 * - 完成后（anchor=completion）：只有「完成后 N 单位」，不选星期 / 日子——
 *   间隔型重复没有「哪一天」。切到完成后时剥离 weekdays / monthDays，
 *   组件内记住剥离前的日子，切回时恢复。
 * 两种模式共用底栏：「下次」预览（纯函数 nextOccurrenceDate）+「结束」（until，
 * 少用，作次要入口）。关闭时只显示开关与一键预设。
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
  // 切到「完成后」前的星期 / 日子，切回「按日程」时恢复
  const stashedDays = React.useRef<Pick<RepeatRule, 'weekdays' | 'monthDays'>>({});

  const rule = normalizeRepeatRule(current.repeatRule);
  const completion = rule?.anchor === 'completion';

  const patchRule = (next: RepeatRule | null) => {
    // 完成后模式不带星期 / 日子（存量组合在下一次编辑时规整掉）
    if (next?.anchor === 'completion') {
      delete next.weekdays;
      delete next.monthDays;
    }
    onPatch({ repeatRule: next });
  };

  const changeMode = (anchor: RepeatRule['anchor']) => {
    if (!rule || anchor === rule.anchor) return;
    if (anchor === 'completion') {
      stashedDays.current = { weekdays: rule.weekdays, monthDays: rule.monthDays };
      patchRule({ ...rule, anchor });
      return;
    }
    const next: RepeatRule = { ...rule, anchor };
    const { weekdays, monthDays } = stashedDays.current;
    if (rule.unit === 'week' && weekdays) next.weekdays = weekdays;
    if (rule.unit === 'month' && monthDays) next.monthDays = monthDays;
    patchRule(next);
  };

  const toggleWeekday = (day: number) => {
    if (!rule) return;
    const weekdays = rule.weekdays ?? [];
    const next = weekdays.includes(day)
      ? weekdays.filter((d) => d !== day)
      : [...weekdays, day].sort((a, b) => a - b);
    patchRule({ ...rule, weekdays: next });
  };

  const toggleMonthDay = (day: number) => {
    if (!rule) return;
    const monthDays = rule.monthDays ?? [];
    const next = monthDays.includes(day)
      ? monthDays.filter((d) => d !== day)
      : [...monthDays, day].sort((a, b) => a - b);
    patchRule({ ...rule, monthDays: next });
  };

  const changeUnit = (unit: RepeatUnit) => {
    if (!rule || unit === rule.unit) return;
    // 离开 week / month 单位时剥离 weekdays / monthDays（数据层归一化也会剥，这里保持 UI 即时一致）
    const next = { ...rule, unit };
    if (unit !== 'week') delete next.weekdays;
    if (unit !== 'month') delete next.monthDays;
    patchRule(next);
  };

  const changeInterval = (value: number) => {
    if (!rule) return;
    const next = Math.min(MAX_INTERVAL, Math.max(1, value));
    if (next === rule.interval) return;
    patchRule({ ...rule, interval: next });
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
        occurrenceDate: current.occurrenceDate ?? null,
        timeZone,
        legacyDateTimeZone: currentLegacyDateTimeZone(),
        settledAt: completion ? new Date().toISOString() : null,
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
    <div className="flex flex-col gap-2 px-2 py-1.5 max-md:gap-3 max-md:py-2" data-repeat-section>
      <div className="flex items-center gap-2">
        <span className="select-none text-sm max-md:text-[15px]">{t('task:repeat')}</span>
        <Switch
          aria-label={t('task:repeat')}
          className="ml-auto shrink-0"
          checked={rule != null}
          onCheckedChange={(checked) => patchRule(checked ? { ...DEFAULT_REPEAT_RULE } : null)}
        />
      </div>

      {!rule ? (
        <div
          role="group"
          aria-label={t('task:repeatPresets')}
          className="grid grid-cols-5 gap-1 max-md:gap-1.5"
        >
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => patchRule({ ...preset.rule })}
              className="h-6 rounded-full bg-muted text-xs text-muted-foreground select-none transition-colors duration-fast hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-9 max-md:text-sm"
            >
              {t(preset.key)}
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* 单位标签放不下时（英文 days/weeks…）整组换到下一行铺满，不压缩溢出 */}
          <div className="flex flex-wrap items-center gap-2">
            <ModePicker anchor={rule.anchor} onChange={changeMode} />
            <IntervalStepper value={rule.interval} onChange={changeInterval} />
            <div
              role="radiogroup"
              aria-label={t('task:repeatUnit')}
              className="flex flex-1 rounded-md bg-muted p-0.5"
            >
              {REPEAT_UNITS.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  role="radio"
                  aria-checked={rule.unit === unit}
                  onClick={() => changeUnit(unit)}
                  className={segmentClass(rule.unit === unit)}
                >
                  {t(`task:repeatUnit-${unit}`)}
                </button>
              ))}
            </div>
          </div>

          {!completion && rule.unit === 'week' && (
            <WeekdayBar
              weekdays={rule.weekdays ?? []}
              weekStartsOn={weekStartsOn}
              onToggle={toggleWeekday}
            />
          )}

          {!completion && rule.unit === 'month' && (
            <MonthDaysPicker
              monthDays={rule.monthDays ?? []}
              scheduledDate={current.scheduledDate ?? null}
              onToggle={toggleMonthDay}
            />
          )}

          <div
            className="flex min-w-0 items-center gap-1.5 rounded-md bg-muted/60 py-1 pl-2 pr-1 text-xs text-muted-foreground max-md:py-1.5 max-md:pl-3 max-md:text-sm"
            data-repeat-footer
          >
            <Repeat className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {current.scheduledDate && (
              // 完成后模式按「今天完成」预览；底栏窄，完整说明放 title
              <p
                className="flex min-w-0 items-center gap-1.5"
                title={completion ? t('task:repeatNextIfToday') : undefined}
                data-repeat-preview
              >
                {previewLabel ? (
                  <>
                    <span className="shrink-0">{t('task:repeatNext')}</span>
                    <span className="shrink-0 font-medium text-foreground">{previewLabel}</span>
                  </>
                ) : (
                  <span className="truncate">{t('task:repeatEnded')}</span>
                )}
              </p>
            )}
            <UntilPicker value={rule.until ?? null} onChange={changeUntil} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 模式选择：间隔行的前缀即下拉（「每 ▾」/「完成后 ▾」）。大多数规则按日程，
 * 不让模式常驻一整行；下拉里带一句说明帮助理解两种模式的差别。
 */
function ModePicker({
  anchor,
  onChange,
}: {
  anchor: RepeatRule['anchor'];
  onChange: (anchor: RepeatRule['anchor']) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const options = [
    {
      anchor: 'scheduled',
      label: 'task:repeatModeScheduled',
      hint: 'task:repeatModeScheduledHint',
    },
    {
      anchor: 'completion',
      label: 'task:repeatModeCompletion',
      hint: 'task:repeatModeCompletionHint',
    },
  ] as const;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('task:repeatModeLabel')}
          className="-ml-1.5 inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs text-muted-foreground select-none transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-accent max-md:h-9 max-md:text-sm"
        >
          {t(anchor === 'completion' ? 'task:repeatCompletionPrefix' : 'task:repeatEvery')}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 bg-popover p-1 backdrop-blur-none"
        role="radiogroup"
        aria-label={t('task:repeatModeLabel')}
      >
        {options.map((option) => (
          <button
            key={option.anchor}
            type="button"
            role="radio"
            aria-checked={anchor === option.anchor}
            onClick={() => {
              onChange(option.anchor);
              setOpen(false);
            }}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:py-2.5"
          >
            <Check
              className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', anchor !== option.anchor && 'invisible')}
              aria-hidden
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm">{t(option.label)}</span>
              <span className="text-xs text-muted-foreground">{t(option.hint)}</span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * 「− N +」整体胶囊：数字可直接输入（大间隔不必连点），±微调，↑/↓ 同 ±。
 * 输入合法即时 patch（popover 点外关闭时不会丢值）；清空或非法在失焦时回显当前值。
 */
function IntervalStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  // 编辑中的草稿（允许暂时为空）；null = 未在编辑，显示 value
  const [draft, setDraft] = React.useState<string | null>(null);
  const stepClass =
    'h-6 w-6 rounded-[5px] px-0 text-muted-foreground hover:bg-background hover:text-foreground max-md:h-9 max-md:w-9 max-md:text-base';

  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    setDraft(digits);
    const next = Number(digits);
    if (digits && next >= 1) onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setDraft(null);
      onChange(value + (e.key === 'ArrowUp' ? 1 : -1));
    } else if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div
      role="group"
      className="flex shrink-0 items-center rounded-md bg-muted p-0.5"
      aria-label={t('task:repeatInterval')}
    >
      <Button
        variant="ghost"
        size="sm"
        className={stepClass}
        aria-label={t('task:repeatIntervalMinus')}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        −
      </Button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={t('task:repeatInterval')}
        value={draft ?? String(value)}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
        onKeyDown={handleKeyDown}
        className="h-6 w-8 rounded-[5px] bg-transparent text-center text-sm tabular-nums outline-none transition-colors hover:bg-background/60 focus:bg-background focus:ring-2 focus:ring-ring/60 max-md:h-9 max-md:w-10 max-md:text-base"
      />
      <Button
        variant="ghost"
        size="sm"
        className={stepClass}
        aria-label={t('task:repeatIntervalPlus')}
        disabled={value >= MAX_INTERVAL}
        onClick={() => onChange(value + 1)}
      >
        +
      </Button>
    </div>
  );
}

/**
 * 星期条：一整条分段控件，选中段填主色；相邻选中段连成一片
 * （工作日一眼可辨）。顺序跟随周起始偏好（仅展示；规则的周期对齐固定 ISO 周一）。
 */
function WeekdayBar({
  weekdays,
  weekStartsOn,
  onToggle,
}: {
  weekdays: number[];
  weekStartsOn: number;
  onToggle: (day: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const order = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);
  // 2023-01-01 是周日（day=0），用真实日期取本地化标签避免手写映射
  const label = (day: number, weekday: 'narrow' | 'long') =>
    new Intl.DateTimeFormat(i18n.language, { weekday }).format(new Date(2023, 0, 1 + day));
  return (
    <div
      role="group"
      aria-label={t('task:repeatWeekdays')}
      className="flex rounded-md bg-muted p-0.5"
    >
      {order.map((day, index) => {
        const active = weekdays.includes(day);
        const prevActive = index > 0 && weekdays.includes(order[index - 1]);
        const nextActive = index < 6 && weekdays.includes(order[index + 1]);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={active}
            aria-label={label(day, 'long')}
            onClick={() => onToggle(day)}
            className={cn(
              'h-6 flex-1 text-xs select-none transition-colors duration-fast focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-9 max-md:text-sm',
              active
                ? cn(
                    'bg-primary font-medium text-primary-foreground',
                    !prevActive && 'rounded-l-[5px]',
                    !nextActive && 'rounded-r-[5px]',
                  )
                : 'rounded-[5px] text-muted-foreground hover:text-foreground',
            )}
          >
            {label(day, 'narrow')}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 月模式日子：默认收起成一行（未选 = 计划日期当天），点「更改」展开
 * 日历式网格（无边框数字、选中实心圆，与日期选择器同一视觉）。
 * 31 显示为「末」（总落在当月最后一天）；未选时计划日期那天以描边示意。
 */
function MonthDaysPicker({
  monthDays,
  scheduledDate,
  onToggle,
}: {
  monthDays: number[];
  scheduledDate: string | null;
  onToggle: (day: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const implicitDay = scheduledDate ? parseCalendarDate(scheduledDate).getDate() : null;

  const summary =
    monthDays.length > 0
      ? formatMonthDays(monthDays, t)
      : implicitDay != null
        ? t('task:repeatMonthDaysImplicit', { day: implicitDay })
        : t('task:repeatMonthDaysDefault');
  const hint = monthDays.some((day) => day === 29 || day === 30)
    ? t('task:repeatMonthDaysClamp')
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs max-md:text-sm">
        <span className="shrink-0 select-none text-muted-foreground">
          {t('task:repeatMonthDaysOn')}
        </span>
        <span className="min-w-0 truncate">{summary}</span>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-9 max-md:px-2"
        >
          {t(expanded ? 'task:repeatMonthDaysDone' : 'task:repeatMonthDaysEdit')}
          <ChevronRight
            className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
            aria-hidden
          />
        </button>
      </div>
      {expanded && (
        <div
          role="group"
          aria-label={t('task:repeatMonthDays')}
          className="grid grid-cols-7 justify-items-center gap-y-0.5 max-md:gap-y-1"
        >
          {MONTH_DAYS.map((day) => {
            const active = monthDays.includes(day);
            const implicit = monthDays.length === 0 && day === implicitDay;
            const last = day === 31;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                aria-label={last ? t('task:repeatSummaryMonthDayLast') : String(day)}
                onClick={() => onToggle(day)}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-full text-sm tabular-nums select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:size-9',
                  last && 'text-xs max-md:text-sm',
                  active
                    ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90'
                    : implicit
                      ? 'text-primary ring-1 ring-inset ring-primary/50 hover:bg-accent'
                      : 'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {last ? t('task:repeatMonthDayLastShort') : day}
              </button>
            );
          })}
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground max-md:text-sm">{hint}</p>}
    </div>
  );
}

/** 「结束」日期（底栏次要入口）：trigger 显示「至 日期」（未设为「永不结束」），点开为日历 + 清除。 */
function UntilPicker({
  value,
  onChange,
}: {
  value: string | null;
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
          aria-label={t('task:repeatEnds')}
          className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 tabular-nums transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-accent max-md:min-h-9 max-md:px-2"
        >
          {selected
            ? t('task:repeatEndsOn', {
                date: new Intl.DateTimeFormat(i18n.language, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                }).format(selected),
              })
            : t('task:repeatEndsNever')}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
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

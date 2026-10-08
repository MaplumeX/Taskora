import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

import {
  parseCalendarDate,
  toInputDateValue,
  usePreferencesStore,
} from '@taskora/api';
import { REVIEW_UNITS, type ReviewInterval } from '@taskora/shared';

import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { getCalendarLocale } from '@/components/task/fields/calendarFieldUtils';
import { cn } from '@/lib/utils';

/** 常用回顾间隔档位。 */
export const REVIEW_PRESETS: ReadonlyArray<{ key: string; interval: ReviewInterval }> = [
  { key: 'weekly', interval: { unit: 'week', count: 1 } },
  { key: 'biweekly', interval: { unit: 'week', count: 2 } },
  { key: 'monthly', interval: { unit: 'month', count: 1 } },
  { key: 'quarterly', interval: { unit: 'month', count: 3 } },
  { key: 'yearly', interval: { unit: 'year', count: 1 } },
];

const sameInterval = (a: ReviewInterval, b: ReviewInterval) =>
  a.unit === b.unit && a.count === b.count;

/** 「每 2 周」式的间隔文案。 */
export function useReviewIntervalLabel(): (interval: ReviewInterval) => string {
  const { t } = useTranslation('review');
  // 1 单独成句（「每周」而不是「每 1 周」）：中文没有单复数形式可借
  return (interval) =>
    interval.count === 1
      ? t(`everySingle_${interval.unit}`)
      : t(`every_${interval.unit}`, { count: interval.count });
}

/** 回顾间隔编辑：常用档位 + 自定义「数字 × 单位」。 */
export function ReviewIntervalEditor({
  value,
  onChange,
}: {
  value: ReviewInterval;
  onChange: (next: ReviewInterval) => void;
}) {
  const { t } = useTranslation('review');
  const [count, setCount] = useState(String(value.count));
  useEffect(() => setCount(String(value.count)), [value.count]);

  const commitCount = () => {
    const next = Number(count);
    if (Number.isInteger(next) && next >= 1) {
      if (next !== value.count) onChange({ ...value, count: next });
    } else {
      setCount(String(value.count));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        {REVIEW_PRESETS.map((preset) => {
          const active = sameInterval(preset.interval, value);
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(preset.interval)}
              className="flex h-7 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent max-md:h-10"
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', !active && 'invisible')} />
              {t(`preset_${preset.key}`)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 px-2">
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-label={t('count')}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          onBlur={commitCount}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitCount();
          }}
          className="w-16"
        />
        <div role="radiogroup" aria-label={t('unit')} className="flex gap-1">
          {REVIEW_UNITS.map((unit) => (
            <button
              key={unit}
              type="button"
              role="radio"
              aria-checked={value.unit === unit}
              onClick={() => onChange({ ...value, unit })}
              className={cn(
                'h-8 rounded-md px-2 text-sm transition-colors',
                value.unit === unit
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {t(`unit_${unit}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 下次回顾日选择（日历）；value / onChange 为日期键。 */
export function NextReviewDateCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const selected = parseCalendarDate(value);
  return (
    <Calendar
      selected={selected}
      onSelect={(date: Date | undefined) => {
        if (date) onChange(toInputDateValue(date));
      }}
      locale={getCalendarLocale(i18n.language)}
      weekStartsOn={weekStartsOn}
    />
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Bell, CalendarDays, CalendarX2 } from 'lucide-react';

import { parseWhenQuery, type WhenCandidate } from '@taskora/shared';
import {
  currentWallTime,
  formatDateLabel,
  fromInputDateValue,
  isToday,
  startOfToday,
  todayDateKey,
  usePreferencesStore,
} from '@taskora/api';

import { useListboxNavigation } from '../../../lib/useListboxNavigation';
import { cn } from '@/lib/utils';

interface Props {
  placeholder: string;
  /** 截止日期没有 Someday。 */
  allowSomeday: boolean;
  /** 可设提醒的上下文才显示并携带时刻；否则只取日期。 */
  showTime: boolean;
  /** 今天候选的图标（计划日期为星星，截止日期为旗帜）。 */
  todayIcon: ReactNode;
  onSelect: (candidate: WhenCandidate) => void;
  /** 输入为空时显示的原有内容（快捷项、日历、提醒区）。 */
  children: ReactNode;
}

/**
 * When 选择器的自然语言输入（`.scratch/when-natural-input`）：输入为空时
 * 显示原有内容；有输入时整块换成候选列表，`↑`/`↓` 移动、`Enter` 选中。
 * 输入框是弹层的第一个可聚焦元素：桌面 Popover 打开即聚焦，窄屏卡片
 * 聚焦卡片本身，不弹出键盘。
 */
export function WhenQueryInput({
  placeholder,
  allowSomeday,
  showTime,
  todayIcon,
  onSelect,
  children,
}: Props) {
  const { t } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    if (!query.trim()) return [];
    const parsed = parseWhenQuery(query, {
      today: todayDateKey(),
      now: currentWallTime(),
      weekStartsOn,
      allowSomeday,
    });
    if (showTime) return parsed;
    // 不能设提醒：去掉时刻后按日期去重
    const seen = new Set<string>();
    return parsed.flatMap((c): WhenCandidate[] => {
      if (c.kind !== 'date') return [c];
      if (seen.has(c.date)) return [];
      seen.add(c.date);
      return [{ kind: 'date', date: c.date }];
    });
  }, [query, weekStartsOn, allowSomeday, showTime]);

  const { listboxId, active, setActiveIndex, optionId, onKeyDown } = useListboxNavigation(
    candidates,
    onSelect,
  );
  const searching = query.trim() !== '';

  return (
    <div className="flex flex-col">
      <input
        type="text"
        role="combobox"
        aria-expanded={searching}
        aria-controls={listboxId}
        aria-activedescendant={candidates.length > 0 ? optionId(active) : undefined}
        aria-autocomplete="list"
        aria-label={placeholder}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
        className="mb-1 h-8 min-w-0 rounded-md bg-muted/60 px-2 text-sm outline-none placeholder:text-muted-foreground max-md:mx-1 max-md:mt-1 max-md:h-10 max-md:text-[15px]"
      />
      {searching ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={placeholder}
          className="flex max-h-72 flex-col gap-0.5 overflow-y-auto"
        >
          {candidates.length === 0 && (
            <p className="px-2 py-2 text-meta text-muted-foreground">
              {t('task:whenQueryNoResults')}
            </p>
          )}
          {candidates.map((candidate, index) => (
            <div
              key={candidateKey(candidate)}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseMove={() => index !== active && setActiveIndex(index)}
              // 保持输入框焦点
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(candidate)}
              className={cn(
                'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm max-md:py-2.5',
                '[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
                index === active && 'bg-accent',
              )}
            >
              <CandidateRow candidate={candidate} todayIcon={todayIcon} />
            </div>
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function candidateKey(candidate: WhenCandidate): string {
  return candidate.kind === 'date' ? candidate.date : candidate.kind;
}

function CandidateRow({
  candidate,
  todayIcon,
}: {
  candidate: WhenCandidate;
  todayIcon: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  if (candidate.kind === 'someday') {
    return (
      <>
        <Archive className="text-nav-someday" />
        <span className="truncate">{t('task:somedayLabel')}</span>
      </>
    );
  }
  if (candidate.kind === 'clear') {
    return (
      <>
        <CalendarX2 className="text-muted-foreground" />
        <span className="truncate">{t('common:clear')}</span>
      </>
    );
  }

  const date = fromInputDateValue(candidate.date);
  const full = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== startOfToday().getFullYear() ? 'numeric' : undefined,
  }).format(date);
  return (
    <>
      <span aria-hidden className="flex">
        {isToday(date) ? todayIcon : <CalendarDays className="text-muted-foreground" />}
      </span>
      <span className="truncate">{formatDateLabel(date)}</span>
      <span className="shrink-0 truncate text-meta text-muted-foreground">{full}</span>
      {candidate.time && (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-meta text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
          <Bell aria-hidden />
          {candidate.time}
        </span>
      )}
    </>
  );
}

import { usePreferencesStore } from '@taskora/api';
import type { RepeatRule } from '@taskora/shared';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { formatRepeatSummary } from './repeatSummary';

interface Props {
  /** 「更新规则」后的规则（摘要用）。 */
  updatedRule: RepeatRule;
  onException: () => void;
  onUpdateRule: () => void;
  onCancel: () => void;
}

/**
 * 改期固定日程重复项时的询问（recurring-tasks-v4，对齐 Things 3.23）：日期
 * 面板原地切换为它，不另开 Dialog（Popover / Drawer 里再开模态会抢焦点、
 * 触发外部点击关闭）。「仅此一次」只挪这一环；「更新规则」此后按新日期
 * 重复；「取消」回到日期面板，不写入。
 */
export function RescheduleRepeatPrompt({
  updatedRule,
  onException,
  onUpdateRule,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const summary = formatRepeatSummary(updatedRule, { t, language: i18n.language, weekStartsOn });

  return (
    <div
      className="flex w-64 flex-col gap-1 p-2 max-md:w-full max-md:gap-2 max-md:p-3"
      data-reschedule-repeat-prompt
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // 只退回日期面板，不关闭外层弹层
        event.stopPropagation();
        onCancel();
      }}
    >
      <p className="px-1 pb-1 text-sm font-semibold max-md:text-[15px]">
        {t('task:rescheduleRepeatTitle')}
      </p>
      <PromptOption
        autoFocus
        label={t('task:rescheduleRepeatException')}
        hint={t('task:rescheduleRepeatExceptionHint')}
        onSelect={onException}
      />
      <PromptOption
        label={t('task:rescheduleRepeatUpdateRule')}
        hint={t('task:rescheduleRepeatUpdateRuleHint', { summary })}
        onSelect={onUpdateRule}
      />
      <Button variant="ghost" size="sm" className="mt-1 self-end" onClick={onCancel}>
        {t('common:cancel')}
      </Button>
    </div>
  );
}

function PromptOption({
  label,
  hint,
  onSelect,
  autoFocus,
}: {
  label: string;
  hint: string;
  onSelect: () => void;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-fast max-md:py-2.5',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60',
      )}
    >
      <span className="text-sm max-md:text-[15px]">{label}</span>
      <span className="text-meta text-muted-foreground">{hint}</span>
    </button>
  );
}

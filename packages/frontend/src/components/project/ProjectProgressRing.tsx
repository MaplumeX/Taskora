import { useTranslation } from 'react-i18next';
import { ProjectStatus } from '@taskora/shared';

import { cn } from '@/lib/utils';

interface Props {
  total: number;
  completed: number;
  projectStatus: ProjectStatus;
  onToggle: () => void;
  disabled?: boolean;
}

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProjectProgressRing({
  total,
  completed,
  projectStatus,
  onToggle,
  disabled,
}: Props) {
  const { t } = useTranslation('task');

  const isDone =
    projectStatus === ProjectStatus.COMPLETED ||
    (total > 0 && completed === total);
  const ratio = total > 0 ? completed / total : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isDone}
      aria-label={t(isDone ? 'markIncomplete' : 'markComplete')}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90',
        !isDone && 'hover:ring-2 hover:ring-primary/20',
        disabled && 'opacity-50',
      )}
    >
      <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]">
        {/* 轨道圆 */}
        <circle
          cx="9"
          cy="9"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={isDone ? 'text-primary' : 'text-muted-foreground/30'}
        />
        {/* 进度圆（进行中且有进度时） */}
        {!isDone && ratio > 0 && (
          <circle
            cx="9"
            cy="9"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 9 9)"
            strokeLinecap="round"
          />
        )}
        {/* 满环时实心填充 */}
        {isDone && (
          <circle cx="9" cy="9" r={RADIUS} fill="currentColor" className="text-primary" />
        )}
        {/* 中心勾 */}
        {isDone && (
          <path
            d="M5.5 9 L8 11.5 L12.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary-foreground"
          />
        )}
      </svg>
    </button>
  );
}
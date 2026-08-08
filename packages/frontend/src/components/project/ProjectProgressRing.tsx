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

  const isChecked = projectStatus === ProjectStatus.COMPLETED;
  const ratio = total > 0 ? completed / total : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      aria-label={t(isChecked ? 'markIncomplete' : 'markComplete')}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90',
        !isChecked && 'hover:ring-2 hover:ring-primary/20',
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
          className={isChecked ? 'text-primary' : 'text-muted-foreground/30'}
        />
        {/* 进度弧（进行中且有进度时，满环时满圈无实心无勾） */}
        {!isChecked && ratio > 0 && (
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
        {/* 已完成时实心填充 */}
        {isChecked && (
          <circle cx="9" cy="9" r={RADIUS} fill="currentColor" className="text-primary" />
        )}
        {/* 中心勾（仅项目已完成时） */}
        {isChecked && (
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
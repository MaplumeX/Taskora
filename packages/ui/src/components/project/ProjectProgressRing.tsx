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

const RADIUS = 8;
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
  // 取消不属于项目模型（ADR 0006 out of scope）；作防御性呈现，与未来扩展兼容。
  const isCancelled = projectStatus === ('CANCELLED' as ProjectStatus);
  const ratio = total > 0 ? completed / total : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      aria-label={t(isCancelled ? 'markUncancelled' : isChecked ? 'markIncomplete' : 'markComplete')}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90',
        disabled && 'opacity-50',
      )}
    >
      <svg viewBox="0 0 20 20" className="h-[20px] w-[20px]">
        {/* 轨道圆 */}
        <circle
          cx="10"
          cy="10"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={
            isChecked ? 'text-primary' : isCancelled ? 'text-muted-foreground/40' : 'text-muted-foreground/30'
          }
        />
        {/* 进度弧（进行中且有进度时，满环时满圈无实心无勾） */}
        {!isChecked && !isCancelled && ratio > 0 && (
          <circle
            cx="10"
            cy="10"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 10 10)"
            strokeLinecap="round"
          />
        )}
        {/* 已完成时实心填充 */}
        {isChecked && (
          <circle cx="10" cy="10" r={RADIUS} fill="currentColor" className="text-primary" />
        )}
        {/* 已取消时弱化实心填充 */}
        {isCancelled && (
          <circle cx="10" cy="10" r={RADIUS} fill="currentColor" className="text-muted-foreground/30" />
        )}
        {/* 中心勾（仅项目已完成时） */}
        {isChecked && (
          <path
            d="M6.5 10 L9 12.5 L14 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary-foreground"
          />
        )}
        {/* 中心叉（仅项目已取消时） */}
        {isCancelled && (
          <path
            d="M7 7 L13 13 M13 7 L7 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-muted-foreground"
          />
        )}
      </svg>
    </button>
  );
}
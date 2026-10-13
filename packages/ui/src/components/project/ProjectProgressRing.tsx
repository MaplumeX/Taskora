import { useTranslation } from 'react-i18next';
import { ProjectStatus, Start } from '@taskora/shared';

import { cn } from '@/lib/utils';

interface Props {
  total: number;
  completed: number;
  projectStatus: ProjectStatus;
  /** 项目的 Start；SOMEDAY 时外圈画虚线、整体用灰色（Things 3）。 */
  start?: Start | string;
  onToggle: () => void;
  disabled?: boolean;
  /** 边长（px）；默认 20，侧边栏用 16。 */
  size?: number;
}

const RADIUS = 8;
/** 进度饼（Things 3）：粗描边小圆画扇形，半径 PIE_RADIUS、线宽 2×PIE_RADIUS。 */
const PIE_RADIUS = 3.25;
const PIE_CIRCUMFERENCE = 2 * Math.PI * PIE_RADIUS;
/** Someday 外圈虚线：12 段等分周长，首尾接缝不出现长短段。 */
const SOMEDAY_DASH = (2 * Math.PI * RADIUS) / 24;

export function ProjectProgressRing({
  total,
  completed,
  projectStatus,
  start,
  onToggle,
  disabled,
  size = 20,
}: Props) {
  const { t } = useTranslation('task');

  const isChecked = projectStatus === ProjectStatus.COMPLETED;
  const isCancelled = projectStatus === ('CANCELLED' as ProjectStatus);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      aria-label={t(
        isCancelled ? 'markUncancelled' : isChecked ? 'markIncomplete' : 'markComplete',
      )}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full transition-opacity',
        disabled && 'opacity-40',
      )}
      style={{ width: size, height: size }}
    >
      <ProjectProgressPie
        total={total}
        completed={completed}
        projectStatus={projectStatus}
        start={start}
        size={size}
      />
    </button>
  );
}

/** 进度饼图形本身（不可交互）：列表 / 搜索结果中只展示项目状态时使用。 */
export function ProjectProgressPie({
  total,
  completed,
  projectStatus,
  start,
  size = 20,
}: Pick<Props, 'total' | 'completed' | 'projectStatus' | 'start' | 'size'>) {
  const isChecked = projectStatus === ProjectStatus.COMPLETED;
  // 取消不属于项目模型（ADR 0006 out of scope）；作防御性呈现，与未来扩展兼容。
  const isCancelled = projectStatus === ('CANCELLED' as ProjectStatus);
  const ratio = total > 0 ? completed / total : 0;
  const offset = PIE_CIRCUMFERENCE * (1 - ratio);
  // 了结后的项目离开 Someday，只有进行中的才画虚线灰色态。
  const isSomeday = start === Start.SOMEDAY && !isChecked && !isCancelled;
  const color = isSomeday ? 'text-muted-foreground' : 'text-primary';

  return (
    <svg viewBox="0 0 20 20" width={size} height={size}>
      {/* 轨道圆 */}
      <circle
        cx="10"
        cy="10"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={isSomeday ? `${SOMEDAY_DASH} ${SOMEDAY_DASH}` : undefined}
        className={color}
      />
      {/* 进度饼（进行中时；满饼时仍无勾，勾只属于已完成）。
          进度为 0 时也保持挂载（offset = 周长，不可见），使 0 → 有进度同样能过渡。 */}
      {!isChecked && !isCancelled && (
        <circle
          cx="10"
          cy="10"
          r={PIE_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={PIE_RADIUS * 2}
          className={cn(color, 'transition-[stroke-dashoffset] duration-slow ease-spring')}
          strokeDasharray={PIE_CIRCUMFERENCE}
          style={{ strokeDashoffset: offset }}
          transform="rotate(-90 10 10)"
        />
      )}
      {/* 已完成时实心填充 */}
      {isChecked && (
        <circle cx="10" cy="10" r={RADIUS} fill="currentColor" className="text-primary" />
      )}
      {/* 已取消时同样实心填充（主题色） */}
      {isCancelled && (
        <circle cx="10" cy="10" r={RADIUS} fill="currentColor" className="text-primary" />
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
          className="text-primary-foreground"
        />
      )}
    </svg>
  );
}

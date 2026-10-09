import * as React from 'react';

import type { TagResponseDto } from '@taskora/shared';

import { FieldPicker } from '@/components/common/FieldPicker';
import { cn } from '@/lib/utils';

/** 徽章式触发器：风格对齐 TaskDateBadge / TaskDueDateBadge（图标 + xs 文字）。 */
export function MetaBadge({
  icon,
  text,
  urgent = false,
  accent = false,
}: {
  icon: React.ReactNode;
  text: string | null;
  /** Deadline 到期/逾期：红色（红色只属于 Deadline）。 */
  urgent?: boolean;
  /** 需要处理但不逾期（待回顾）：交互蓝，与侧边栏回顾入口同色。 */
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        urgent ? 'text-deadline' : accent ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      {icon}
      {text}
    </span>
  );
}

/**
 * 可点击的元数据徽章：trigger 内渲染徽章内容（无值时退化为图标按钮），
 * 选择器（宽屏 Popover / 窄屏居中卡片）内容复用任务字段组件。
 */
export function MetaPopover({
  label,
  children,
  trigger,
}: {
  label: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  trigger: React.ReactNode;
}) {
  return (
    <FieldPicker
      label={label}
      trigger={
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:h-9"
        >
          {trigger}
        </button>
      }
    >
      {children}
    </FieldPicker>
  );
}

/**
 * 页头元数据行的布局壳：左槽放标签 / 计划 / 重复，右槽靠右放截止 / 回顾日
 * （Deadline 是页头里唯一「催促」的信息，单独靠右）。左缘与备注对齐
 * （-ml-1.5 抵消触发器按钮的 px-1.5 内边距）。
 */
export function MetaRowLayout({
  start,
  end,
}: {
  start: React.ReactNode;
  end: React.ReactNode;
}) {
  return (
    <div className="-ml-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">{start}</div>
      <div className="ml-auto flex flex-wrap items-center gap-x-1 gap-y-1">{end}</div>
    </div>
  );
}

/** 元数据分组间的细竖线（右槽里分开 Deadline 与回顾）。 */
export function MetaDivider() {
  return <span aria-hidden className="mx-1 h-3 w-px bg-border" />;
}

/**
 * 标签胶囊：标签色浅底 + 色点 + 名称（页头位置宽裕，全部显示、自动换行）。
 * 浅底用 color-mix 从标签色派生，文字保持正文色以保证可读性。
 */
export function MetaTagPills({ tags }: { tags: readonly TagResponseDto[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex max-w-[10rem] items-center gap-1 rounded-full px-2 py-px text-meta text-foreground"
          style={{ backgroundColor: `color-mix(in srgb, ${tag.color} 16%, transparent)` }}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
          <span className="truncate">{tag.title}</span>
        </span>
      ))}
    </span>
  );
}

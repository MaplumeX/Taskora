import * as React from 'react';

import type { TagResponseDto } from '@taskora/shared';

import { FieldPicker } from '@/components/common/FieldPicker';
import { cn } from '@/lib/utils';

/** 徽章式触发器：风格对齐 TaskDateBadge / TaskDueDateBadge（图标 + xs 文字）。 */
export function MetaBadge({
  icon,
  text,
  urgent = false,
}: {
  icon: React.ReactNode;
  text: string | null;
  urgent?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        urgent ? 'text-deadline' : 'text-muted-foreground',
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
          title={label}
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

/** 标签徽章：前 5 个标签的色点（title 提示携带标签名）。 */
export function MetaTagDots({ tags }: { tags: readonly TagResponseDto[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {tags.slice(0, 5).map((tag) => (
        <span
          key={tag.id}
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: tag.color }}
          title={tag.title}
        />
      ))}
    </span>
  );
}

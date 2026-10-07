import { useId, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SelectionState } from '@taskora/api';

import { cn } from '@/lib/utils';

interface Props {
  /** 组头代表的父级 id（Project / Area id），同时是 Selection 行 id。 */
  parentId: string;
  selectionState?: SelectionState;
  to: string;
  title: string;
  icon?: ReactNode;
  /** 标题右侧的常驻元信息，不参与标题链接的 hover。 */
  trailing?: ReactNode;
  placeholder?: boolean;
}

/**
 * Things 式 Group Header：图标 / 进度环 + 黑色加粗标题，淡色分隔线。
 * 标题悬停变蓝并显示右箭头，不加文字下划线或整行背景。
 * 导航链接承接键盘 Selection；图标独立，允许项目进度环保留完成操作。
 * 组间留白与拖拽投放面由外层 GroupHeaderDropZone 承载。
 */
export function GroupHeaderRowShell({
  parentId,
  selectionState = 'idle',
  to,
  title,
  icon,
  trailing,
  placeholder = false,
}: Props) {
  const titleId = useId();
  return (
    <h2
      data-group-header={parentId}
      aria-labelledby={titleId}
      className="flex min-w-0 items-center gap-2.5 border-b border-border px-2"
    >
      {icon}
      <Link
        to={to}
        data-selection-row={parentId}
        tabIndex={selectionState !== 'idle' ? 0 : -1}
        className={cn(
          'group/header-link flex min-h-9 min-w-0 items-center gap-1 text-body font-semibold text-foreground no-underline hover:text-primary focus-visible:text-primary max-md:min-h-11',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
          placeholder && 'text-muted-foreground',
          selectionState !== 'idle' && 'bg-selection',
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // Enter 保留链接的原生导航，避免全局「展开任务」拦截默认行为。
          // Space 继续冒泡给全局「下方新建」。
          if (event.key === 'Enter') event.stopPropagation();
        }}
      >
        <span id={titleId} className="truncate">
          {title}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/header-link:opacity-100 group-focus-visible/header-link:opacity-100"
        />
      </Link>
      {trailing && <span className="ml-auto shrink-0 whitespace-nowrap">{trailing}</span>}
    </h2>
  );
}

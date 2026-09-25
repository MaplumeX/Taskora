import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { SelectionState } from '@taskora/api';

interface Props {
  /** 组头代表的父级 id（项目/领域 id），同时是 Selection 行 id。 */
  parentId: string;
  /** 用于 chevron aria-label 的组标题（resolve 占位符后的文案）。 */
  label: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  selectionState?: SelectionState;
  /** 点击行体（及行上 Enter）打开父级详情页。 */
  onOpen: () => void;
  children: React.ReactNode;
}

/**
 * Group Header（分组头）行脚手架：chevron（唯一的折叠手段）+ 全行样式
 * （h-10、Selection 高亮）+ 点击/Enter 打开详情。项目与领域组头共用，
 * 组头不可拖拽（组间顺序由侧边栏持有）。
 */
export function GroupHeaderRowShell({
  parentId,
  label,
  collapsed,
  onToggleCollapse,
  selectionState = 'idle',
  onOpen,
  children,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      data-group-header={parentId}
      data-selection-row={parentId}
      role="button"
      tabIndex={selectionState !== 'idle' ? 0 : -1}
      aria-selected={selectionState !== 'idle' || undefined}
      aria-expanded={!collapsed}
      className={cn(
        'group flex h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-accent/40 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
        selectionState !== 'idle' && 'bg-accent focus-visible:ring-0 hover:bg-accent',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        // 忽略来自嵌套按钮（chevron / 进度环）的按键。
        if (e.target !== e.currentTarget) return;
        // 只处理 Enter：Space 留给全局键位「下方新建」（在该父级内建任务）。
        if (e.key !== 'Enter') return;
        e.preventDefault();
        onOpen();
      }}
    >
      <button
        type="button"
        aria-label={t(collapsed ? 'nav:expand' : 'nav:collapse', { label })}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronRight
          className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-90')}
        />
      </button>
      {children}
    </div>
  );
}

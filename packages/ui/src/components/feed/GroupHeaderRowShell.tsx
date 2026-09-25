import { cn } from '@/lib/utils';
import type { SelectionState } from '@taskora/api';

interface Props {
  /** 组头代表的父级 id（项目/领域 id），同时是 Selection 行 id。 */
  parentId: string;
  selectionState?: SelectionState;
  /** 点击行体（及行上 Enter）打开父级详情页。 */
  onOpen: () => void;
  children: React.ReactNode;
}

/**
 * Group Header（分组头）行脚手架：小节标题形态（文字加重 + 下横线 +
 * 组间大间隔），无折叠按钮。点击/Enter 打开详情。项目与领域组头共用；
 * 组头不可拖拽（组间顺序由侧边栏持有）。
 */
export function GroupHeaderRowShell({ parentId, selectionState = 'idle', onOpen, children }: Props) {
  return (
    <div
      data-group-header={parentId}
      data-selection-row={parentId}
      role="button"
      tabIndex={selectionState !== 'idle' ? 0 : -1}
      aria-selected={selectionState !== 'idle' || undefined}
      className={cn(
        'group flex h-10 cursor-pointer items-center gap-2 rounded-lg border-b-2 border-border/80 px-2 pt-2 transition-colors hover:bg-accent/40',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
        selectionState !== 'idle' && 'bg-accent focus-visible:ring-0 hover:bg-accent',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        // 忽略来自嵌套按钮（进度环）的按键。
        if (e.target !== e.currentTarget) return;
        // 只处理 Enter：Space 留给全局键位「下方新建」（在该父级内建任务）。
        if (e.key !== 'Enter') return;
        e.preventDefault();
        onOpen();
      }}
    >
      {children}
    </div>
  );
}

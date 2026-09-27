import { cn } from '@/lib/utils';

/**
 * 侧边栏条目行（Things 3 式）：28px 行高、6px 圆角、彩色图标；
 * hover 为浅色 sidebar-accent，选中为实色 sidebar-accent + 半粗体。
 */
export function sidebarRowClass(isActive: boolean, className?: string) {
  return cn(
    'flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-body text-foreground hover-instant hover:bg-sidebar-accent/60 max-md:h-11',
    isActive && 'bg-sidebar-accent font-semibold hover:bg-sidebar-accent',
    className,
  );
}

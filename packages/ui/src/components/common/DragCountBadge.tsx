/** 多项拖拽浮层上的件数徽标：被拖行右侧，标出一起拖动的任务数。 */
export function DragCountBadge({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span
      data-testid="drag-count-badge"
      className="absolute right-2 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full bg-primary px-1.5 text-meta font-medium tabular-nums text-primary-foreground shadow-sm"
    >
      {count}
    </span>
  );
}

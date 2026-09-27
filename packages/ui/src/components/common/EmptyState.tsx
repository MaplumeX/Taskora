import { SquareCheckBig } from 'lucide-react';
import { useInRouterContext, useLocation } from 'react-router-dom';

import { mainNav, trashNav } from '@/components/layout/navItems';
import { cn } from '@/lib/utils';

const ICON_CLASS = 'h-12 w-12 text-muted-foreground/35';

/**
 * 列表空状态（Things 3）：居中的大号灰色 Bucket 线性图标 + 一行灰色文案，
 * 不加插画、不加底色圆。图标按当前路由取对应 Bucket，其余页面用通用勾选图标。
 */
export function EmptyState({ hint, className }: { hint: string; className?: string }) {
  const inRouter = useInRouterContext();
  return (
    <div
      className={cn(
        'mt-16 flex flex-col items-center justify-center gap-3 py-12 text-center',
        className,
      )}
    >
      {inRouter ? (
        <RouteBucketIcon />
      ) : (
        <SquareCheckBig aria-hidden className={ICON_CLASS} strokeWidth={1.25} />
      )}
      <p className="text-body text-muted-foreground">{hint}</p>
    </div>
  );
}

function RouteBucketIcon() {
  const { pathname } = useLocation();
  const Icon =
    [...mainNav, trashNav].find((n) => pathname.startsWith(n.to))?.icon ?? SquareCheckBig;
  return <Icon aria-hidden className={ICON_CLASS} strokeWidth={1.25} />;
}

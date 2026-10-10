import type { ReactNode } from 'react';

import { hiddenListNavs, mainNav, reviewNav, trashNav } from '@/components/layout/navItems';
import { cn } from '@/lib/utils';

interface Props {
  /** 对应 mainNav 的路由；命中时在手机端标题前显示该 Bucket 的彩色图标。 */
  nav?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Bucket 页面的大标题（Things 3）：标题前带与侧边栏 / 首页列表同色的图标。
 */
export function PageHeading({ nav, className, children }: Props) {
  const item = nav
    ? [...mainNav, trashNav, reviewNav, ...hiddenListNavs].find((n) => n.to === nav)
    : undefined;
  const Icon = item?.icon;

  return (
    <h1
      className={cn(
        'flex items-center gap-2.5 text-title-1',
        className,
      )}
    >
      {Icon && (
        <Icon aria-hidden className={cn('h-7 w-7 shrink-0', item.colorClass)} />
      )}
      {children}
    </h1>
  );
}

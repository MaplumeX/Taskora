import type { ReactNode } from 'react';

import { mainNav } from '@/components/layout/navItems';
import { cn } from '@/lib/utils';

interface Props {
  /** 对应 mainNav 的路由；命中时在手机端标题前显示该 Bucket 的彩色图标。 */
  nav?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Bucket 页面的大标题。手机端（Things 3 iOS）标题前带与首页列表同色的
 * 图标；桌面端侧边栏已承担图标识别，保持纯文字。
 */
export function PageHeading({ nav, className, children }: Props) {
  const item = nav ? mainNav.find((n) => n.to === nav) : undefined;
  const Icon = item?.icon;

  return (
    <h1
      className={cn(
        'flex items-center gap-2.5 font-display text-3xl font-semibold tracking-tight',
        className,
      )}
    >
      {Icon && (
        <Icon aria-hidden className={cn('h-7 w-7 shrink-0 md:hidden', item.colorClass)} />
      )}
      {children}
    </h1>
  );
}

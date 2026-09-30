import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { QuickFind } from '@/components/search/QuickFind';
import { cn } from '@/lib/utils';

/**
 * 返回上一列表（Things 3 iOS 的 push 导航）。有路由历史时后退；冷启动
 * 直接落在某个列表（location.key 为 'default'）时回到首页并替换当前
 * 记录，使系统返回手势在首页即可退出。
 */
export function MobileBackButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('common:back')}
      className={cn('h-11 w-11 md:hidden', className)}
      onClick={() => {
        if (location.key !== 'default') navigate(-1);
        else navigate('/home', { replace: true });
      }}
    >
      <ChevronLeft className="h-6 w-6" />
    </Button>
  );
}

/**
 * 手机端顶部导航条：左返回、右搜索。首页自带快速查找、助手页自带
 * 会话切换头（内含返回），两者不渲染本条，避免双重顶条。
 */
export function MobileTopBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  if (pathname === '/home' || pathname.startsWith('/agent')) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between bg-background/95 px-1 py-0.5 backdrop-blur-sm md:hidden">
      <MobileBackButton />
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('search:title')}
        className="h-11 w-11"
        onClick={() => setSearchOpen(true)}
      >
        <Search className="h-5 w-5" />
      </Button>
      <QuickFind open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

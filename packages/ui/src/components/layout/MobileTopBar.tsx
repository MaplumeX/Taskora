import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';

/** 手机端顶部搜索入口（sticky），桌面端搜索仍由 Cmd+K + 底部功能条承担。 */
export function MobileTopBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  // 助手页自带会话切换头，避免双重顶条
  if (pathname.startsWith('/agent')) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-end border-b bg-background/95 px-2 py-1.5 backdrop-blur-sm md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('task:searchTasks')}
        className="h-11 w-11"
        onClick={() => setSearchOpen(true)}
      >
        <Search className="h-5 w-5" />
      </Button>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

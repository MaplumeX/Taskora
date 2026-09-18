import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bot, LogOut, Settings, Tags as TagsIcon, Trash2 } from 'lucide-react';

import { ProjectStatus } from '@taskora/shared';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarProjectSection } from '@/components/layout/SidebarProjectSection';
import { mainNav } from '@/components/layout/navItems';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@taskora/api';
import { useLogout } from '@taskora/api';
import { useUiInteractionStore } from '@taskora/api';
import { useProjectsQuery } from '@taskora/api';
import { useAreasQuery } from '@taskora/api';
import { useTagsQuery } from '@taskora/api';

/** 抽屉内直接展示的主导航剩余项（今天/收件箱/日历/任何时间已在 TabBar 中） */
const DRAWER_MAIN_NAV_TO = ['/upcoming', '/someday', '/logbook'];

const DRAWER_ROW_CLASS =
  'flex min-h-[44px] items-center gap-2.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function MobileNavDrawer({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const { data: allProjects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { data: tags = [] } = useTagsQuery();

  const projects = allProjects.filter((p) => p.status !== ProjectStatus.COMPLETED);

  const close = () => onOpenChange(false);
  const go = (to: string) => {
    close();
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-0 right-0 bottom-0 top-auto max-h-[85dvh] w-full max-w-none max-md:max-w-none translate-x-0 translate-y-0 gap-0 rounded-t-2xl border-border/50 p-0 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0">
        <div
          aria-hidden
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
        />
        <DialogTitle className="sr-only">{t('nav:moreNavigation')}</DialogTitle>
        <ScrollArea className="max-h-[calc(85dvh-2rem)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {/* 用户信息 */}
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                (user?.displayName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()
              )}
            </span>
            <span className="truncate text-sm font-medium">
              {user?.displayName ?? user?.email ?? t('common:notLoggedIn')}
            </span>
          </div>

          <Separator className="my-2" />

          {/* 助手：顶部独立入口（与桌面侧边栏的 copilot 位对齐） */}
          <div className="flex flex-col gap-0.5">
            <NavLink
              to="/agent"
              onClick={close}
              className={({ isActive }) =>
                cn(DRAWER_ROW_CLASS, isActive && 'bg-accent font-medium text-foreground')
              }
            >
              <Bot className="h-4 w-4" />
              {t('nav:assistant')}
            </NavLink>
          </div>

          <Separator className="my-2" />

          {/* 主导航剩余项：近期 / 将来 / 日志 */}
          <div className="flex flex-col gap-0.5">
            {mainNav
              .filter((item) => DRAWER_MAIN_NAV_TO.includes(item.to))
              .map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={close}
                    className={({ isActive }) =>
                      cn(DRAWER_ROW_CLASS, isActive && 'bg-accent font-medium text-foreground')
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {t(item.labelKey)}
                  </NavLink>
                );
              })}
          </div>

          <Separator className="my-2" />

          {/* 项目 / 区域 */}
          <SidebarProjectSection projects={projects} areas={areas} />

          <Separator className="my-2" />

          {/* 标签 */}
          <NavLink
            to="/tags"
            onClick={close}
            className={({ isActive }) =>
              cn(DRAWER_ROW_CLASS, isActive && 'bg-accent font-medium text-foreground')
            }
          >
            <TagsIcon className="h-4 w-4" />
            {t('nav:tags')}
          </NavLink>
          {tags.length > 0 && (
            <div className="ml-4 flex flex-col gap-0.5 border-l pl-2">
              {tags.map((tag) => (
                <NavLink
                  key={tag.id}
                  to={`/tags/${tag.id}`}
                  onClick={close}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[44px] items-center truncate rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground',
                      isActive && 'bg-accent font-medium text-foreground',
                    )
                  }
                >
                  <span
                    className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="truncate">{tag.title}</span>
                </NavLink>
              ))}
            </div>
          )}

          <Separator className="my-2" />

          {/* 回收站 / 设置 / 登出 */}
          <div className="flex flex-col gap-0.5 pb-2">
            <button type="button" className={DRAWER_ROW_CLASS} onClick={() => go('/trash')}>
              <Trash2 className="h-4 w-4" />
              {t('nav:trash')}
            </button>
            <button
              type="button"
              className={DRAWER_ROW_CLASS}
              onClick={() => {
                close();
                openSettings('appearance');
              }}
            >
              <Settings className="h-4 w-4" />
              {t('common:settings')}
            </button>
            <button
              type="button"
              className={DRAWER_ROW_CLASS}
              onClick={() => {
                close();
                void logout().then(() => navigate('/login', { replace: true }));
              }}
            >
              <LogOut className="h-4 w-4" />
              {t('common:logout')}
            </button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

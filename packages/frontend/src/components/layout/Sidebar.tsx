import * as React from 'react';
import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  Circle,
  Inbox,
  Notebook,
  Sun,
  Tags as TagsIcon,
  Trash2,
  CloudSun,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useLogout } from '@/lib/hooks/useAuth';
import { ProjectStatus } from '@taskora/shared';
import { SidebarBottomBar } from '@/components/layout/SidebarBottomBar';
import { SidebarProjectSection } from '@/components/layout/SidebarProjectSection';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useTagsQuery } from '@/lib/hooks/useTags';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const mainNav: NavItem[] = [
  { to: '/inbox', labelKey: 'nav:inbox', icon: Inbox },
  { to: '/today', labelKey: 'nav:today', icon: Sun },
  { to: '/upcoming', labelKey: 'nav:upcoming', icon: CalendarDays },
  { to: '/anytime', labelKey: 'nav:anytime', icon: Circle },
  { to: '/someday', labelKey: 'nav:someday', icon: CloudSun },
  { to: '/logbook', labelKey: 'nav:logbook', icon: Notebook },
];

const NavRow = ({ item }: { item: NavItem }) => {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground',
          isActive && 'bg-accent font-medium text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      {t(item.labelKey)}
    </NavLink>
  );
};

function CollapsibleSection({
  labelKey,
  emptyHintKey,
  emptyTitlePlaceholderKey,
  icon: Icon,
  to,
  items,
}: {
  labelKey: string;
  emptyHintKey: string;
  emptyTitlePlaceholderKey: string;
  icon: LucideIcon;
  to: string;
  items: { id: string; title: string; href: string }[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(true);
  const label = t(labelKey);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative flex items-center">
        <NavLink
          to={to}
          className={({ isActive }) =>
            cn(
              'flex flex-1 items-center gap-2.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground',
              isActive && 'bg-accent font-medium text-foreground',
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? t('nav:collapse', { label }) : t('nav:expand', { label })}
          className="absolute right-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')}
          />
        </button>
      </div>
      {open && (
        <div className="ml-4 flex flex-col gap-0.5 border-l pl-2">
          {items.length === 0 ? (
            <span className="px-3 py-1 text-xs text-muted-foreground/70">{t(emptyHintKey)}</span>
          ) : (
            items.map((item) => (
              <NavLink
                key={item.id}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'truncate rounded-full px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground',
                    isActive && 'bg-accent font-medium text-foreground',
                  )
                }
              >
                {item.title || t(emptyTitlePlaceholderKey)}
              </NavLink>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const { data: allProjects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { data: tags = [] } = useTagsQuery();

  // 侧边栏仅展示 ACTIVE 项目，已完成项目不参与侧边栏导航树
  const projects = allProjects.filter(
    (p) => p.status !== ProjectStatus.COMPLETED,
  );

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-secondary/60 backdrop-blur-sm">
      <div className="px-4 pb-2 pt-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-medium"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  (user?.displayName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()
                )}
              </span>
              <span className="truncate">{user?.displayName ?? user?.email ?? t('common:notLoggedIn')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="truncate">{user?.displayName ?? user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openSettings('account')}>
              <Settings className="mr-2 h-4 w-4" />
              {t('auth:accountSettings')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>{t('common:logout')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator className="mb-2" />

      <ScrollArea className="flex-1 px-2">
        <div className="flex flex-col gap-0.5">
          {mainNav.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </div>

        <Separator className="my-3" />

        <div className="flex flex-col gap-1">
          <SidebarProjectSection projects={projects} areas={areas} />
        </div>

        <Separator className="my-3" />

        <div className="flex flex-col gap-1">
          <CollapsibleSection
            labelKey="nav:tags"
            icon={TagsIcon}
            to="/tags"
            emptyHintKey="nav:emptyTags"
            emptyTitlePlaceholderKey="tag:new"
            items={tags.map((t) => ({ id: t.id, title: t.title, href: `/tags/${t.id}` }))}
          />
        </div>

        <Separator className="my-3" />

        <div className="flex flex-col gap-0.5">
          <NavRow item={{ to: '/trash', labelKey: 'nav:trash', icon: Trash2 }} />
        </div>
      </ScrollArea>

      <SidebarBottomBar />
    </aside>
  );
}
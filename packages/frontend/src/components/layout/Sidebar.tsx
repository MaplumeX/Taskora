import * as React from 'react';
import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  Circle,
  Folder,
  Inbox,
  Layers,
  Sun,
  Trash2,
  CloudSun,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useLogout } from '@/lib/hooks/useAuth';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
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
  label: string;
  icon: LucideIcon;
}

const mainNav: NavItem[] = [
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/upcoming', label: 'Upcoming', icon: CalendarDays },
  { to: '/anytime', label: 'Anytime', icon: Circle },
  { to: '/someday', label: 'Someday', icon: CloudSun },
];

const NavRow = ({ item }: { item: NavItem }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive && 'bg-accent font-medium text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </NavLink>
  );
};

function CollapsibleSection({
  label,
  icon: Icon,
  to,
  items,
  emptyHint,
}: {
  label: string;
  icon: LucideIcon;
  to: string;
  items: { id: string; title: string; href: string }[];
  emptyHint: string;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative flex items-center">
        <NavLink
          to={to}
          className={({ isActive }) =>
            cn(
              'flex flex-1 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
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
          aria-label={open ? `收起${label}` : `展开${label}`}
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
            <span className="px-3 py-1 text-xs text-muted-foreground/70">{emptyHint}</span>
          ) : (
            items.map((item) => (
              <NavLink
                key={item.id}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'truncate rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                    isActive && 'bg-accent font-medium text-foreground',
                  )
                }
              >
                {item.title}
              </NavLink>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-secondary/40">
      <div className="px-4 pb-2 pt-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-medium"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {user?.email?.[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="truncate">{user?.email ?? '未登录'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>登出</DropdownMenuItem>
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
          <CollapsibleSection
            label="Projects"
            icon={Folder}
            to="/projects"
            emptyHint="暂无项目"
            items={projects.map((p) => ({ id: p.id, title: p.title, href: `/projects/${p.id}` }))}
          />
        </div>

        <Separator className="my-3" />

        <div className="flex flex-col gap-1">
          <CollapsibleSection
            label="Areas"
            icon={Layers}
            to="/areas"
            emptyHint="暂无区域"
            items={areas.map((a) => ({ id: a.id, title: a.title, href: `/areas/${a.id}` }))}
          />
        </div>

        <Separator className="my-3" />

        <div className="flex flex-col gap-0.5">
          <NavRow item={{ to: '/trash', label: 'Trash', icon: Trash2 }} />
        </div>
      </ScrollArea>
    </aside>
  );
}
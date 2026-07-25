import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  Circle,
  Inbox,
  Layers,
  Sun,
  Trash2,
  CloudSun,
  Folder,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useLogout } from '@/lib/hooks/useAuth';
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

const libraryNav: NavItem[] = [
  { to: '/projects', label: 'Projects', icon: Folder },
  { to: '/areas', label: 'Areas', icon: Layers },
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

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

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

        <div className="flex flex-col gap-0.5">
          {libraryNav.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </div>

        <Separator className="my-3" />

        <div className="flex flex-col gap-0.5">
          <NavRow item={{ to: '/trash', label: 'Trash', icon: Trash2 }} />
        </div>
      </ScrollArea>
    </aside>
  );
}
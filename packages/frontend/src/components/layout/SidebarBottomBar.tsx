import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Settings, SunMedium, Moon, Monitor, Check, FolderPlus, Layers, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTheme, type ThemeMode } from '@/lib/hooks/useTheme';
import { useCreateProject } from '@/lib/hooks/useProjects';
import { useCreateArea } from '@/lib/hooks/useAreas';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { i18n } from '@/i18n/config';

const themeIcons: Record<ThemeMode, LucideIcon> = {
  light: SunMedium,
  dark: Moon,
  system: Monitor,
};

const languages = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
] as const;

export function SidebarBottomBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode, cycle } = useTheme();
  const createProject = useCreateProject();
  const createArea = useCreateArea();
  const setPendingAutoEditId = useUiInteractionStore((s) => s.setPendingAutoEditId);

  const handleNewProject = () => {
    createProject.mutate({ title: '' }, {
      onSuccess: (p) => {
        setPendingAutoEditId(p.id);
        navigate(`/projects/${p.id}`);
      },
      onError: () => toast.error(t('common:createFailed')),
    });
  };

  const handleNewArea = () => {
    createArea.mutate({ title: '' }, {
      onSuccess: (a) => {
        setPendingAutoEditId(a.id);
        navigate(`/areas/${a.id}`);
      },
      onError: () => toast.error(t('common:createFailed')),
    });
  };

  const ThemeIcon = themeIcons[mode];

  return (
    <div className="flex items-center justify-between gap-1 px-2 pb-3 pt-2">
      {/* 新增按钮 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-1.5 px-2 text-sm text-muted-foreground">
            <Plus className="h-4 w-4" />
            {t('common:add')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-40"
          // 创建成功后标题输入框会自动聚焦。菜单关闭动画结束时若恢复
          // trigger 焦点，会让输入框立即 blur 并退出编辑态。
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuItem
            disabled={createProject.isPending}
            onClick={handleNewProject}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            {t('common:newProject')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={createArea.isPending}
            onClick={handleNewArea}
          >
            <Layers className="mr-2 h-4 w-4" />
            {t('common:newArea')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 设置按钮 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label={t('common:settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-44">
          <DropdownMenuItem onClick={cycle}>
            <ThemeIcon className="mr-2 h-4 w-4" />
            {t('theme:' + mode)}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {languages.map((lng) => (
            <DropdownMenuItem
              key={lng.code}
              onClick={() => void i18n.changeLanguage(lng.code)}
            >
              <span
                className={cn(
                  'mr-2 h-4 w-4 flex items-center justify-center',
                  i18n.language === lng.code ? 'opacity-100' : 'opacity-0',
                )}
              >
                <Check className="h-4 w-4" />
              </span>
              {lng.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

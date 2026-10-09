import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Settings, FolderPlus, Layers } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCreateListActions, useUiInteractionStore } from '@taskora/api';

export function SidebarBottomBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { handleNewProject, handleNewArea, newProjectPending, newAreaPending } =
    useCreateListActions({
      navigateToProject: (id) => navigate(`/projects/${id}`),
      navigateToArea: (id) => navigate(`/areas/${id}`),
    });
  const openSettings = useUiInteractionStore((s) => s.openSettings);

  return (
    <div className="flex items-center justify-between gap-1 px-2 pb-3 pt-2">
      {/* 新增按钮 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="gap-1.5 px-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60"
          >
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
            disabled={newProjectPending}
            onClick={() => handleNewProject()}
          >
            <FolderPlus className="h-4 w-4" />
            {t('common:newProject')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={newAreaPending}
            onClick={handleNewArea}
          >
            <Layers className="h-4 w-4" />
            {t('common:newArea')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 设置按钮 */}
      <Hint label={t('common:settings')}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:bg-sidebar-accent/60"
          aria-label={t('common:settings')}
          data-preload-route="/settings"
          onClick={() => openSettings('appearance')}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </Hint>
    </div>
  );
}

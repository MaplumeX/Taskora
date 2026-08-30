import { useEffect, useState } from 'react';
import { FolderPlus, Heading, Plus, Search } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { CreateTaskDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import { useCreateProject, useProjectsQuery } from '@/lib/hooks/useProjects';
import { useCreateTask } from '@/lib/hooks/useTasks';
import { usePageTaskContext } from '@/lib/hooks/usePageTaskContext';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useCreateProjectHeading } from '@/lib/hooks/useProjectHeadings';

const HIDE_ADD_TASK_ROUTES = ['/upcoming', '/calendar', '/logbook', '/trash'];

export function ContentBottomBar() {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const createTask = useCreateTask();
  const createProject = useCreateProject();
  const createHeading = useCreateProjectHeading();
  const ctx = usePageTaskContext();
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);
  const setPendingAutoEditId = useUiInteractionStore((s) => s.setPendingAutoEditId);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { id: routeId } = useParams<{ id: string }>();
  const { data: areas } = useAreasQuery();
  const { data: projects } = useProjectsQuery();
  const showAddTask = !HIDE_ADD_TASK_ROUTES.includes(pathname);

  // 仅在当前 area 存在时才显示添加项目按钮
  const isAreaDetail = pathname.startsWith('/areas/') && !!routeId;
  const areaExists = areas?.some((a) => a.id === routeId) ?? false;
  const showAddProject = isAreaDetail && areaExists;
  const isProjectDetail = pathname.startsWith('/projects/') && !!routeId;
  const projectExists = projects?.some((project) => project.id === routeId) ?? false;
  const showAddHeading = isProjectDetail && projectExists;

  const handleAddProject = () => {
    if (!routeId) return;
    createProject.mutate(
      { title: '', areaId: routeId },
      {
        onSuccess: (p) => {
          setPendingAutoEditId(p.id);
          navigate(`/projects/${p.id}`);
        },
        onError: () => toast.error(t('common:createFailed')),
      },
    );
  };

  const handleAddHeading = () => {
    if (!routeId) return;
    createHeading.mutate(
      { projectId: routeId, title: '' },
      {
        onSuccess: (heading) => setPendingAutoEditId(heading.id),
        onError: () => toast.error(t('project:createHeadingFailed')),
      },
    );
  };

  // Cmd/Ctrl+K → open search modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleAddTask = () => {
    const payload: CreateTaskDto = { title: '', ...ctx };
    createTask.mutate(payload, {
      onSuccess: (created) => {
        setExpandedId(created.id);
      },
      onError: () => toast.error(t('common:createFailed')),
    });
  };

  return (
    <>
      <footer className="flex h-11 shrink-0 items-center justify-center gap-2 border-t bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('task:searchTasks')}
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-5 w-5" />
        </Button>
        {showAddProject && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('project:addProject')}
            onClick={handleAddProject}
            disabled={createProject.isPending}
          >
            <FolderPlus className="h-5 w-5" />
          </Button>
        )}
        {showAddHeading && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('project:addHeading')}
            onClick={handleAddHeading}
            disabled={createHeading.isPending}
          >
            <Heading className="h-5 w-5" />
          </Button>
        )}
        {showAddTask && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('task:addTask')}
            onClick={handleAddTask}
            disabled={createTask.isPending}
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </footer>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

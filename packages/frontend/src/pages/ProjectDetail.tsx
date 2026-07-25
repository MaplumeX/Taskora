import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { useProjectsQuery, useDeleteProject } from '@/lib/hooks/useProjects';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { TaskListView } from '@/components/task/TaskListView';
import { ProjectForm } from '@/components/project/ProjectForm';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: projects = [] } = useProjectsQuery();
  const project = projects.find((p) => p.id === id);
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ projectId: id });
  const [editOpen, setEditOpen] = React.useState(false);
  const deleteProject = useDeleteProject();

  const handleDelete = () => {
    if (!project) return;
    if (!window.confirm(`确认删除项目「${project.title}」？`)) return;
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        toast.success('项目已删除');
        navigate('/projects');
      },
      onError: () => toast.error('删除失败'),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/projects')}
            className="mb-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ‹ 返回 Projects
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{project?.title ?? '项目'}</h1>
        </div>
        <Button variant="ghost" onClick={() => setEditOpen(true)}>
          编辑
        </Button>
        <Button variant="ghost" className="text-[#CC4444]" onClick={handleDelete}>
          删除
        </Button>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">加载失败</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint="项目中没有任务" />
      )}
      {project && <ProjectForm open={editOpen} onOpenChange={setEditOpen} project={project} />}
    </div>
  );
}
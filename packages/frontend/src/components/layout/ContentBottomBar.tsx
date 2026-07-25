import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';

import type { CreateTaskDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import { useCreateTask } from '@/lib/hooks/useTasks';
import { usePageTaskContext } from '@/lib/hooks/usePageTaskContext';
import { toast } from 'sonner';

export function ContentBottomBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const createTask = useCreateTask();
  const ctx = usePageTaskContext();
  const [, setParams] = useSearchParams();

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
    const payload: CreateTaskDto = { title: '新任务', ...ctx };
    createTask.mutate(payload, {
      onSuccess: (created) => {
        setParams({ expand: created.id }, { replace: true });
      },
      onError: () => toast.error('创建失败'),
    });
  };

  return (
    <>
      <footer className="flex h-12 shrink-0 items-center justify-center gap-2 border-t bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="搜索任务"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="添加任务"
          onClick={handleAddTask}
          disabled={createTask.isPending}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </footer>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
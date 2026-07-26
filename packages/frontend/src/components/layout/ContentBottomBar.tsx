import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { CreateTaskDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import { useCreateTask } from '@/lib/hooks/useTasks';
import { usePageTaskContext } from '@/lib/hooks/usePageTaskContext';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { toast } from 'sonner';

export function ContentBottomBar() {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const createTask = useCreateTask();
  const ctx = usePageTaskContext();
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);

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
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('task:addTask')}
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
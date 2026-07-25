import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TaskListView } from '@/components/task/TaskListView';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useTasksQuery } from '@/lib/hooks/useTasks';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SearchModal({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const hasQuery = debouncedQuery.trim().length > 0;

  const { data: tasks = [], isPending, isError } = useTasksQuery(
    hasQuery
      ? { q: debouncedQuery.trim(), completed: includeCompleted || undefined }
      : undefined,
    { enabled: hasQuery },
  );

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      // delay to next tick so the input is mounted
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(timer);
    }
    // Reset query when closed
    setQuery('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>搜索任务</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="输入关键词搜索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={includeCompleted}
              onCheckedChange={(v) => setIncludeCompleted(v === true)}
            />
            包含已完成
          </label>
          {hasQuery && (
            <>
              {isPending && (
                <p className="py-4 text-sm text-muted-foreground">搜索中…</p>
              )}
              {isError && (
                <p className="py-4 text-sm text-destructive">搜索失败，请重试。</p>
              )}
              {!isPending && !isError && (
                <ScrollArea className="max-h-[60vh]">
                  {tasks.length > 0 ? (
                    <TaskListView
                      tasks={tasks}
                      emptyHint="未找到匹配的任务"
                    />
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">
                      未找到匹配的任务
                    </p>
                  )}
                </ScrollArea>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
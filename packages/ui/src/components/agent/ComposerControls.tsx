import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Check, ChevronDown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAgentModels, useUpdateAgentConfig } from '@taskora/api';
import { AGENT_THINKING_LEVELS, type AgentThinkingLevel } from '@taskora/shared';

/**
 * Quick switchers embedded in the composer, ChatGPT/Claude-style: a model
 * pill and a thinking-effort pill. Both write through the BYOK config; the
 * backend drops cached Agent instances so the next message picks them up.
 * Rendered only when the Assistant is configured, and disabled while a run
 * is streaming (a config change would abort it).
 */
export function ComposerControls({
  modelId,
  thinkingLevel,
  disabled,
}: {
  modelId: string;
  thinkingLevel: AgentThinkingLevel;
  disabled: boolean;
}) {
  const { t } = useTranslation(['agent', 'common']);
  const update = useUpdateAgentConfig();
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');

  // Fetch lazily: only probe the endpoint when the picker is open.
  const {
    data: modelsResult,
    isPending: modelsPending,
    isError: modelsError,
  } = useAgentModels(modelPickerOpen);

  const models = useMemo(() => {
    const models = modelsResult?.models ?? [];
    // Keep the active model visible even when the endpoint list is empty or
    // failed — switching back to it should never require a round-trip.
    const withCurrent = models.includes(modelId) || !modelId ? models : [modelId, ...models];
    const needle = filter.trim().toLowerCase();
    return needle ? withCurrent.filter((m) => m.toLowerCase().includes(needle)) : withCurrent;
  }, [modelsResult, modelId, filter]);

  const thinkingBusy = update.isPending && update.variables?.thinkingLevel !== undefined;
  const modelBusy = update.isPending && update.variables?.modelId !== undefined;

  const applyThinking = (level: AgentThinkingLevel) => {
    if (level === thinkingLevel) return;
    update.mutate(
      { thinkingLevel: level },
      {
        onError: (error) =>
          toast.error(t('agent:error'), { description: (error as Error).message }),
      },
    );
  };

  const applyModel = (id: string) => {
    setModelPickerOpen(false);
    if (id === modelId) return;
    update.mutate(
      { modelId: id },
      {
        onError: (error) =>
          toast.error(t('agent:error'), { description: (error as Error).message }),
      },
    );
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      {/* 模型选择器：显示当前 modelId，弹出可搜索的模型列表 */}
      <Popover
        open={modelPickerOpen}
        onOpenChange={(open) => {
          setModelPickerOpen(open);
          if (open) setFilter('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || modelBusy}
            className="h-7 min-w-0 gap-1 rounded-full px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
            aria-label={t('agent:modelLabel')}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-44 truncate">{modelId || t('agent:modelLabel')}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <div className="border-b border-border p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('agent:searchModelPlaceholder')}
              className="h-7 border-none bg-muted/50 text-xs shadow-none focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && models.length > 0) applyModel(models[0]);
                e.stopPropagation();
              }}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {modelsPending ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t('common:loading')}
              </p>
            ) : modelsError ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t('agent:modelListUnavailable')}
              </p>
            ) : models.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t('agent:modelListEmpty')}
              </p>
            ) : (
              models.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyModel(id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="truncate">{id}</span>
                  {id === modelId ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* 思考强度选择器 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || thinkingBusy}
            className={`h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs font-normal ${
              thinkingLevel === 'off'
                ? 'text-muted-foreground hover:text-foreground'
                : 'text-foreground'
            }`}
            aria-label={t('agent:thinkingLevelLabel')}
          >
            <Brain className={`h-3.5 w-3.5 ${thinkingLevel === 'off' ? '' : 'text-primary'}`} />
            <span>
              {t('agent:thinkingLevelLabel')}·{t(`agent:thinkingLevel_${thinkingLevel}`)}
            </span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          {AGENT_THINKING_LEVELS.map((level) => (
            <DropdownMenuItem key={level} onClick={() => applyThinking(level)}>
              <span className="flex flex-1 items-center justify-between gap-2">
                {t(`agent:thinkingLevel_${level}`)}
                {level === thinkingLevel ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

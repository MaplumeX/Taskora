import { useTranslation } from 'react-i18next';
import { Check, Loader2, Wrench, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { summarizeArgs, type ChatItem } from './buildChatItems';

export function UserBubble({ text }: { text: string }) {
  const { t } = useTranslation(['agent']);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap break-words">
        <span className="sr-only">{t('you')}: </span>
        {text}
      </div>
    </div>
  );
}

export function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-accent px-4 py-2.5 text-sm text-accent-foreground whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}

export function ErrorBubble({ text }: { text: string }) {
  const { t } = useTranslation(['agent']);
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
        <p className="mb-0.5 font-medium">{t('error')}</p>
        <p className="whitespace-pre-wrap break-words opacity-90">{text}</p>
      </div>
    </div>
  );
}

export function ToolCallCard({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const { t } = useTranslation(['agent']);
  const argSummary = summarizeArgs(item.args);

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          'flex max-w-[85%] items-start gap-2 rounded-xl border px-3 py-2 text-xs',
          item.status === 'error'
            ? 'border-destructive/40 bg-destructive/10'
            : 'border-border bg-muted/40',
        )}
      >
        {item.status === 'running' ? (
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : item.status === 'error' ? (
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            <Wrench className="mr-1 inline h-3 w-3 align-[-1px]" />
            {item.status === 'running'
              ? t('agent:toolRunning', { tool: item.toolName })
              : item.status === 'error'
                ? t('agent:toolFailed', { tool: item.toolName })
                : t('agent:toolDone', { tool: item.toolName })}
          </p>
          {argSummary ? (
            <p className="truncate text-muted-foreground" title={argSummary}>
              {argSummary}
            </p>
          ) : null}
          {item.resultText && item.status !== 'running' ? (
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">
              {item.resultText}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  const { t } = useTranslation(['agent']);
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl bg-accent px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
        <span className="sr-only">{t('agent:thinking')}</span>
      </div>
    </div>
  );
}

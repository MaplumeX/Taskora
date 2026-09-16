import { useTranslation } from 'react-i18next';
import { Bot, Check, Loader2, Wrench, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { summarizeArgs, type ChatItem } from './buildChatItems';

/** User message: right-aligned solid bubble (ChatGPT-style). */
export function UserBubble({ text }: { text: string }) {
  const { t } = useTranslation(['agent']);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        <span className="sr-only">{t('you')}: </span>
        {text}
      </div>
    </div>
  );
}

/** Assistant message: plain full-width typography with an avatar, no bubble. */
export function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-words pt-1 text-sm leading-relaxed">
        {text}
      </div>
    </div>
  );
}

export function ErrorBubble({ text }: { text: string }) {
  const { t } = useTranslation(['agent']);
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60">
        {item.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : item.status === 'error' ? (
          <X className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <Check className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div
        className={cn(
          'min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs',
          item.status === 'error'
            ? 'border-destructive/40 bg-destructive/10'
            : 'border-border bg-muted/30',
        )}
      >
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
  );
}

export function TypingIndicator() {
  const { t } = useTranslation(['agent']);
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-1.5 pt-2">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
        <span className="sr-only">{t('agent:thinking')}</span>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, Check, ChevronDown, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { summarizeArgs, type ChatItem } from './buildChatItems';
import { Markdown } from './Markdown';

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

/**
 * Assistant message: full-width plain typography, no avatar. Direction
 * (left vs right-aligned user bubble) already identifies the speaker —
 * Claude/Perplexity-style.
 */
export function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="min-w-0 text-sm leading-relaxed">
      <Markdown content={text} />
    </div>
  );
}

/**
 * Reasoning/thinking block — a sub-element of the assistant turn, indented
 * to align with the reply text (Claude-style log line + fold). Collapsed by
 * default once persisted, live and expanded while the model is still
 * thinking (streaming).
 */
export function ThinkingBlock({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const { t } = useTranslation(['agent']);
  const [open, setOpen] = useState(false);
  const expanded = streaming || open;
  const preview = text.trim().split('\n')[0]?.slice(0, 80) ?? '';

  return (
    <div className="ml-4 min-w-0">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={expanded}
        onClick={() => setOpen((v) => !v)}
      >
        {streaming ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <ChevronDown
            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', expanded && 'rotate-180')}
          />
        )}
        <Brain className="h-3.5 w-3.5 shrink-0" />
        {streaming ? t('thinking') : t('thoughtProcess')}
        {!streaming && !open && preview ? (
          <span className="min-w-0 truncate opacity-70">· {preview}</span>
        ) : null}
      </button>
      {expanded ? (
        <div className="whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
          {text}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorBubble({ text }: { text: string }) {
  const { t } = useTranslation(['agent']);
  return (
    <div className="ml-4 min-w-0">
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <p className="mb-0.5 font-medium">{t('error')}</p>
        <p className="whitespace-pre-wrap break-words opacity-90">{text}</p>
      </div>
    </div>
  );
}

/**
 * Collapsible tool-call card — a sub-element of the assistant turn, indented
 * to align with the reply text. Collapsed: one quiet log line (status icon +
 * tool name + arg summary); expanded: args & result.
 */
export function ToolCallCard({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const { t } = useTranslation(['agent']);
  const [open, setOpen] = useState(false);
  const argSummary = summarizeArgs(item.args);
  const hasDetails = Boolean(argSummary || item.resultText);
  const isError = item.status === 'error';

  return (
    <div className="ml-4 min-w-0">
      <div
        className={cn(
          'min-w-0 rounded-xl border text-xs transition-colors',
          isError
            ? 'border-destructive/40 bg-destructive/10'
            : 'border-border bg-muted/30 hover:border-border/80',
        )}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
          aria-expanded={open}
          disabled={!hasDetails}
          onClick={() => setOpen((v) => !v)}
        >
          {item.status === 'running' ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          ) : item.status === 'error' ? (
            <X className="h-3 w-3 shrink-0 text-destructive" />
          ) : (
            <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="shrink-0 font-mono font-medium text-foreground">{item.toolName}</span>
          <span
            className={cn(
              'shrink-0 text-[11px]',
              item.status === 'running'
                ? 'text-muted-foreground'
                : isError
                  ? 'text-destructive'
                  : 'text-muted-foreground/70',
            )}
          >
            {item.status === 'running'
              ? t('toolRunning')
              : item.status === 'error'
                ? t('toolFailedShort')
                : t('toolDoneShort')}
          </span>
          {argSummary && !open ? (
            <span className="min-w-0 truncate text-muted-foreground/80">{argSummary}</span>
          ) : null}
          {hasDetails ? (
            <ChevronDown
              className={cn(
                'ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          ) : null}
        </button>
        {open ? (
          <div className="space-y-2 border-t border-border/60 px-3 py-2">
            {argSummary ? (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  {t('toolArgs')}
                </p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/70 p-2 font-mono text-[11px] leading-relaxed text-foreground/90">
                  {JSON.stringify(item.args, null, 2)}
                </pre>
              </div>
            ) : null}
            {item.resultText && item.status !== 'running' ? (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  {t('toolResult')}
                </p>
                <pre
                  className={cn(
                    'max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg p-2 font-mono text-[11px] leading-relaxed',
                    isError
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-background/70 text-foreground/90',
                  )}
                >
                  {item.resultText}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  const { t } = useTranslation(['agent']);
  return (
    <div className="ml-4 flex items-center gap-1.5 py-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
      <span className="sr-only">{t('thinking')}</span>
    </div>
  );
}

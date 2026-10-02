import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ToolChatItem } from './buildChatItems';
import { Markdown } from './Markdown';
import { toolIcon, toolLabel, toolSubject } from './toolPresentation';

/** User message: right-aligned solid bubble (ChatGPT-style). */
export function UserBubble({ text }: { text: string }) {
  const { t } = useTranslation(['agent']);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
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

export function ErrorBubble({ text }: { text: string }) {
  const { t } = useTranslation(['agent']);
  return (
    <div className="min-w-0">
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <p className="mb-0.5 font-medium">{t('error')}</p>
        <p className="whitespace-pre-wrap break-words opacity-90">{text}</p>
      </div>
    </div>
  );
}

function ToolStatusIcon({ item }: { item: ToolChatItem }) {
  if (item.status === 'running') return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />;
  if (item.status === 'error') return <X className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  return createElement(toolIcon(item.toolName), { className: 'h-3.5 w-3.5 shrink-0' });
}

/**
 * One tool call as a log line: action icon + human label + subject (entity
 * title / query / view). Spinner while running, red ✗ on failure. Clicking
 * reveals the raw args & result.
 */
export function ToolCallLine({ item }: { item: ToolChatItem }) {
  const { t } = useTranslation(['agent']);
  const [open, setOpen] = useState(false);
  const isError = item.status === 'error';
  const subject = toolSubject(item, t);
  const hasArgs = Object.keys(item.args).length > 0;
  const hasDetails = hasArgs || Boolean(item.resultText);

  return (
    <div className="min-w-0">
      <button
        type="button"
        className={cn(
          'group flex w-full min-w-0 items-center gap-1.5 rounded-lg py-1 text-left text-xs transition-colors',
          isError ? 'text-destructive' : 'text-muted-foreground hover:text-foreground',
        )}
        aria-expanded={open}
        disabled={!hasDetails}
        onClick={() => setOpen((v) => !v)}
      >
        <ToolStatusIcon item={item} />
        <span className="shrink-0 font-medium">{toolLabel(item.toolName, t)}</span>
        {subject ? <span className="min-w-0 truncate opacity-80">{subject}</span> : null}
        {isError ? <span className="shrink-0">· {t('toolFailedShort')}</span> : null}
        {hasDetails ? (
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-100',
              open && 'rotate-180 opacity-100',
            )}
          />
        ) : null}
      </button>
      {open ? (
        <div className="mb-1 ml-[7px] space-y-2 border-l-2 border-border py-1 pl-3">
          {hasArgs ? (
            <div>
              <p className="mb-1 text-meta font-medium text-muted-foreground">{t('toolArgs')}</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-foreground/90">
                {JSON.stringify(item.args, null, 2)}
              </pre>
            </div>
          ) : null}
          {item.resultText && item.status !== 'running' ? (
            <div>
              <p className="mb-1 text-meta font-medium text-muted-foreground">{t('toolResult')}</p>
              <pre
                className={cn(
                  'max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg p-2 font-mono text-[11px] leading-relaxed',
                  isError ? 'bg-destructive/10 text-destructive' : 'bg-muted/40 text-foreground/90',
                )}
              >
                {item.resultText}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

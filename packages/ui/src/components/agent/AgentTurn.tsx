import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, ChevronDown, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { isWriteTool, type ChatTurn, type ProcessStep } from './buildChatItems';
import { AssistantBubble, ToolCallLine } from './bubbles';
import { describeTool } from './toolPresentation';

/** Last non-empty line of a thinking stream — what the model is on right now. */
function lastLine(text: string): string {
  return (
    text
      .trim()
      .split('\n')
      .filter((line) => line.trim())
      .at(-1)
      ?.slice(0, 120) ?? ''
  );
}

/** Thinking entry of the timeline: one-line preview, click for the full text. */
function ThinkingStep({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const { t } = useTranslation(['agent']);
  const [open, setOpen] = useState(false);
  const expanded = streaming || open;
  const preview = text.trim().split('\n')[0]?.slice(0, 80) ?? '';

  return (
    <div className="min-w-0">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={expanded}
        onClick={() => setOpen((v) => !v)}
      >
        <Brain className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0 font-medium">
          {streaming ? t('thinking') : t('thoughtProcess')}
        </span>
        {!expanded && preview ? (
          <span className="min-w-0 truncate opacity-80">{preview}</span>
        ) : null}
      </button>
      {expanded ? (
        <div className="mb-1 ml-[7px] whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
          {text}
        </div>
      ) : null}
    </div>
  );
}

function StepView({ step }: { step: ProcessStep }) {
  if (step.kind === 'thinking') return <ThinkingStep text={step.text} streaming={step.streaming} />;
  if (step.kind === 'tool') return <ToolCallLine item={step} />;
  // Narration between tool calls ("let me check…").
  return (
    <p className="whitespace-pre-wrap break-words py-1 text-xs leading-relaxed text-muted-foreground">
      {step.text}
    </p>
  );
}

/**
 * The turn's process as one line (ChatGPT-style). While the agent works it
 * shows the current step live; afterwards it collapses to an outcome summary
 * — what changed, else what was looked up ("Changed 2 items, 1 failed").
 * Expanding reveals the full timeline: thinking, narration and every tool
 * call, in order.
 */
function ProcessBlock({ turn }: { turn: ChatTurn }) {
  const { t } = useTranslation(['agent']);
  const [open, setOpen] = useState(false);
  const { steps } = turn;
  const working = turn.active && !turn.answerStreaming;

  const tools = steps.filter((step) => step.kind === 'tool');
  const succeeded = tools.filter((tool) => tool.status !== 'error');
  const failed = tools.length - succeeded.length;
  const changes = succeeded.filter((tool) => isWriteTool(tool.toolName)).length;
  const lookups = succeeded.length - changes;

  let status: string;
  if (working) {
    const running = tools.find((tool) => tool.status === 'running');
    const last = steps.at(-1);
    if (running) status = describeTool(running, t);
    else if (last?.kind === 'thinking' && last.streaming) {
      status = [t('thinking'), lastLine(last.text)].filter(Boolean).join(' ');
    } else status = t('thinking');
  } else if (changes > 0) status = t('processChanged', { count: changes });
  else if (lookups > 0) status = t('processLookedUp', { count: lookups });
  else if (failed > 0) status = '';
  else status = t('processThought');

  return (
    <div className="min-w-0">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
        disabled={steps.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        {working ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <ChevronDown
            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          />
        )}
        <span className="min-w-0 truncate font-medium">
          {status}
          {failed > 0 ? (
            <span className="text-destructive">
              {status ? t('processSeparator') : null}
              {t('toolFailedCount', { count: failed })}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="ml-[7px] border-l-2 border-border pl-3">
          {steps.map((step) => (
            <StepView key={step.id} step={step} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One agent turn: the collapsible process, then the answer. */
export function AgentTurn({ turn }: { turn: ChatTurn }) {
  const showProcess = turn.steps.length > 0 || (turn.active && !turn.answerStreaming);

  return (
    <div className="min-w-0 space-y-1.5">
      {showProcess ? <ProcessBlock turn={turn} /> : null}
      {turn.answer ? (
        <div className="pt-1">
          <AssistantBubble text={turn.answer} />
        </div>
      ) : null}
    </div>
  );
}

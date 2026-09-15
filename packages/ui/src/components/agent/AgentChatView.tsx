import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, MessageSquare, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  agentKeys,
  useAgentConfig,
  useConversationMessages,
  usePendingApprovals,
  useResolveApproval,
  useSendConversationMessage,
} from '@taskora/api';
import type { AgentMessageJson, ConversationMessageDto } from '@taskora/shared';
import { useUiInteractionStore } from '@taskora/api';

import { buildChatItems, type ChatItem } from './buildChatItems';
import { ApprovalCard } from './ApprovalCard';
import { AssistantBubble, ErrorBubble, ToolCallCard, TypingIndicator, UserBubble } from './bubbles';
import { useAgentStream } from './useAgentStream';

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text?: string } => c?.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
  }
  return '';
}

/**
 * Right-hand side of the Assistant page: message stream + tool cards +
 * approval cards + composer for one conversation.
 */
export function AgentChatView({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation(['agent', 'common']);
  const queryClient = useQueryClient();
  const { data: messages = [] } = useConversationMessages(conversationId);
  const { data: approvals = [] } = usePendingApprovals(conversationId);
  const sendMessage = useSendConversationMessage(conversationId);
  const resolveApproval = useResolveApproval(conversationId);
  const { data: config } = useAgentConfig();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const stream = useAgentStream(conversationId);

  const items: ChatItem[] = useMemo(
    () =>
      buildChatItems(
        messages.map((m) => m.message),
        stream.runningToolCallIds,
      ),
    [messages, stream.runningToolCallIds],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, stream.streamingText, approvals.length]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || sendMessage.isPending) return;
    setInput('');
    // Optimistic user bubble; the SSE message_end is deduped by text.
    queryClient.setQueryData<ConversationMessageDto[]>(
      agentKeys.messages(conversationId),
      (current) => {
        const list = current ?? [];
        return [
          ...list,
          {
            id: `local-${Date.now()}`,
            seq: list.length,
            message: { role: 'user', content } as AgentMessageJson,
            createdAt: new Date().toISOString(),
          },
        ];
      },
    );
    sendMessage.mutate(content, {
      onError: (error) => {
        toast.error(t('agent:error'), { description: (error as Error).message });
      },
    });
  };

  const busy = sendMessage.isPending || stream.agentActive;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {config && !config.configured ? (
        <div className="border-b border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
          {t('agent:notConfiguredHint')}{' '}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => openSettings('assistant')}
          >
            {t('agent:openSettings')}
          </Button>
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-6">
        {items.length === 0 && !stream.streamingText ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
            <p className="max-w-sm text-sm text-muted-foreground">{t('agent:emptyState')}</p>
          </div>
        ) : null}

        {items.map((item) => {
          if (item.kind === 'user') return <UserBubble key={item.id} text={item.text} />;
          if (item.kind === 'assistant') return <AssistantBubble key={item.id} text={item.text} />;
          if (item.kind === 'tool') return <ToolCallCard key={item.id} item={item} />;
          return <ErrorBubble key={item.id} text={item.text} />;
        })}

        {stream.streamingText !== null ? (
          <AssistantBubble text={stream.streamingText} />
        ) : stream.agentActive ? (
          <TypingIndicator />
        ) : null}

        {approvals.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            pending={resolveApproval.isPending}
            onResolve={(decision) =>
              resolveApproval.mutate(
                { approvalId: approval.id, decision },
                { onError: () => toast.error(t('agent:error')) },
              )
            }
          />
        ))}

        {stream.lastError ? <ErrorBubble text={stream.lastError} /> : null}
      </div>

      {!stream.connected ? (
        <div className="flex items-center justify-center gap-1.5 border-t border-border bg-muted/40 py-1.5 text-xs text-muted-foreground">
          <WifiOff className="h-3 w-3" />
          {t('agent:connectionLost')}
        </div>
      ) : null}

      <div className="border-t border-border p-3 md:p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t('agent:messageInputPlaceholder')}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            className="max-h-36 min-h-[2.5rem] resize-none"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || busy}
            aria-label={t('agent:send')}
            className={cn('shrink-0')}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export { textOf };

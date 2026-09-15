import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  useAgentConfig,
  useConversations,
  useCreateConversation,
  useUiInteractionStore,
} from '@taskora/api';

import { AgentChatView } from '@/components/agent/AgentChatView';
import { ConversationSidebar } from '@/components/agent/ConversationSidebar';

/**
 * Assistant chat view (route /agent). Left: conversation list. Right: the
 * active conversation's message stream. Shared by web and desktop.
 */
export default function AgentPage() {
  const { t } = useTranslation(['agent']);
  const { data: conversations = [], isLoading } = useConversations();
  const { data: config } = useAgentConfig();
  const create = useCreateConversation();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Select the most recent conversation (list is updatedAt-desc).
  useEffect(() => {
    if (activeId && conversations.some((c) => c.id === activeId)) return;
    setActiveId(conversations[0]?.id ?? null);
  }, [conversations, activeId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h1 className="px-4 pt-6 pb-3 font-display text-2xl font-semibold tracking-tight md:px-6">
        {t('agent:assistant')}
      </h1>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-t-xl border border-border bg-background shadow-sm md:mx-4 md:mb-4">
        {/* Conversation list: hidden on narrow screens for V1 */}
        <div className="hidden md:flex">
          <ConversationSidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {activeId ? (
            <AgentChatView key={activeId} conversationId={activeId} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
              {isLoading ? null : config && !config.configured ? (
                <>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {t('agent:notConfiguredHint')}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => openSettings('assistant')}>
                    {t('agent:openSettings')}
                  </Button>
                </>
              ) : (
                <>
                  <p className="max-w-sm text-sm text-muted-foreground">{t('agent:emptyState')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={create.isPending}
                    onClick={() =>
                      create.mutate(undefined, { onSuccess: (c) => setActiveId(c.id) })
                    }
                  >
                    {t('agent:newConversation')}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

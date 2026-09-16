import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListPlus, MessageSquare, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useAgentConfig,
  useConversations,
  useCreateConversation,
  useUiInteractionStore,
} from '@taskora/api';
import { cn } from '@/lib/utils';

import { AgentChatView } from '@/components/agent/AgentChatView';
import { ConversationSidebar } from '@/components/agent/ConversationSidebar';

/**
 * Assistant chat view (route /agent), ChatGPT-style: no embedded panel —
 * the conversation list and message stream fill the whole main area.
 * Desktop: two columns. Mobile: a compact conversation-picker header.
 */
export default function AgentPage() {
  const { t } = useTranslation(['agent']);
  const { data: conversations = [], isLoading } = useConversations();
  const { data: config } = useAgentConfig();
  const create = useCreateConversation();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Select the most recent conversation (list is updatedAt-desc).
  useEffect(() => {
    if (activeId && conversations.some((c) => c.id === activeId)) return;
    setActiveId(conversations[0]?.id ?? null);
  }, [conversations, activeId]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const newConversation = () => create.mutate(undefined, { onSuccess: (c) => setActiveId(c.id) });

  const emptyState = (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
      {isLoading ? null : config && !config.configured ? (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">{t('agent:notConfiguredHint')}</p>
          <Button variant="outline" size="sm" onClick={() => openSettings('assistant')}>
            {t('agent:openSettings')}
          </Button>
        </>
      ) : (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">{t('agent:emptyState')}</p>
          <Button variant="outline" size="sm" disabled={create.isPending} onClick={newConversation}>
            {t('agent:newConversation')}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* 桌面：会话列表作为主区左栏 */}
      <div className="hidden md:flex">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动端：紧凑会话切换头 */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-2 md:hidden">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setPickerOpen(true)}>
            <ListPlus className="h-4 w-4" />
            <span className="max-w-40 truncate text-sm">
              {active?.title ?? t('agent:assistant')}
            </span>
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('agent:newConversation')}
            disabled={create.isPending}
            onClick={newConversation}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {activeId ? <AgentChatView key={activeId} conversationId={activeId} /> : emptyState}
      </div>

      {/* 移动端会话选择弹层 */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('agent:conversations')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  conversation.id === activeId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
                onClick={() => {
                  setActiveId(conversation.id);
                  setPickerOpen(false);
                }}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{conversation.title ?? t('agent:untitled')}</span>
              </button>
            ))}
            {conversations.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t('agent:noConversations')}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

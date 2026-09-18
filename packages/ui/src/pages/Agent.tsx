import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, MessageSquare, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import {
  useAgentConfig,
  useConversations,
  useCreateConversation,
  useUiInteractionStore,
} from '@taskora/api';

import { AgentChatView } from '@/components/agent/AgentChatView';
import { ConversationList } from '@/components/agent/ConversationList';

/**
 * Assistant chat view (route /agent), ChatGPT-style: the conversation list
 * lives in a slide-in drawer summoned from a slim header, so the message
 * stream gets the full width. Desktop and mobile share the same structure.
 */
export default function AgentPage() {
  const { t } = useTranslation(['agent']);
  const { data: conversations = [], isLoading } = useConversations();
  const { data: config } = useAgentConfig();
  const create = useCreateConversation();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Select the most recent conversation (list is updatedAt-desc).
  useEffect(() => {
    if (activeId && conversations.some((c) => c.id === activeId)) return;
    setActiveId(conversations[0]?.id ?? null);
  }, [conversations, activeId]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const newConversation = () => create.mutate(undefined, { onSuccess: (c) => setActiveId(c.id) });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 极简 header：会话抽屉入口 + 当前标题 + 新建 */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 md:px-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="h-4 w-4" />
          <span className="max-w-56 truncate text-sm font-medium">
            {active?.title ?? t('agent:assistant')}
          </span>
        </Button>
        <div className="flex-1" />
        <Hint label={t('agent:newConversation')}>
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
        </Hint>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
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
                  onClick={newConversation}
                >
                  {t('agent:newConversation')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 会话抽屉：按需召唤，切换后自动关闭 */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerTitle>{t('agent:conversations')}</DrawerTitle>
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              setDrawerOpen(false);
            }}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

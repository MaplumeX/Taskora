import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, PanelRight, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useActiveConversation, useCreateConversation } from '@taskora/api';

import { AgentChatView } from '@/components/agent/AgentChatView';
import { AgentEmptyState } from '@/components/agent/AgentEmptyState';
import { useDockToPanel } from '@/components/agent/AssistantPanel';
import { MobileBackButton } from '@/components/layout/MobileTopBar';
import { ConversationList } from '@/components/agent/ConversationList';

/**
 * Assistant chat view (route /agent), ChatGPT-style: the conversation list
 * lives in a slide-in drawer summoned from a slim header, so the message
 * stream gets the full width. Desktop and mobile share the same structure.
 */
export default function AgentPage() {
  const { t } = useTranslation(['agent']);
  // Shared with the Assistant panel: both views show the same conversation.
  const { conversations, isLoading, active, activeId, setActiveId } = useActiveConversation();
  const create = useCreateConversation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dockToPanel = useDockToPanel();

  const newConversation = () => create.mutate(undefined, { onSuccess: (c) => setActiveId(c.id) });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 极简 header：（手机端返回）+ 会话抽屉入口 + 当前标题 + 新建 */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 md:px-3">
        <MobileBackButton className="-ml-1" />
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
        {/* 收回到面板：面板只在桌面端存在 */}
        <Hint label={t('agent:dockToPanel')} action="toggleAssistantPanel">
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 md:inline-flex"
            aria-label={t('agent:dockToPanel')}
            onClick={dockToPanel}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </Hint>
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
          <AgentEmptyState loading={isLoading} />
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

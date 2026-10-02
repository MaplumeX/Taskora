import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  useAgentConfig,
  useCreateConversation,
  useAssistantUiStore,
  useUiInteractionStore,
} from '@taskora/api';

/**
 * Shown by both Assistant views when there is no conversation yet: points
 * to the BYOK settings when unconfigured, else offers a new conversation.
 */
export function AgentEmptyState({ loading = false }: { loading?: boolean }) {
  const { t } = useTranslation(['agent']);
  const { data: config } = useAgentConfig();
  const create = useCreateConversation();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const setActiveId = useAssistantUiStore((s) => s.setActiveConversationId);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
      {loading ? null : config && !config.configured ? (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">{t('agent:notConfiguredHint')}</p>
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
            onClick={() => create.mutate(undefined, { onSuccess: (c) => setActiveId(c.id) })}
          >
            {t('agent:newConversation')}
          </Button>
        </>
      )}
    </div>
  );
}

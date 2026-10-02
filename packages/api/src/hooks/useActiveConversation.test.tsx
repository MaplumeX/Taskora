import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConversationDto } from '@taskora/shared';

import { useAssistantUiStore } from '@/stores/assistantUi.store';
import { agentKeys, useActiveConversation } from './useAgent';

function conversation(id: string): ConversationDto {
  return { id, title: id, createdAt: '', updatedAt: '' } as ConversationDto;
}

function renderActive(list: ConversationDto[]) {
  const client = new QueryClient();
  client.setQueryData(agentKeys.conversations, list);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useActiveConversation(), { wrapper }) };
}

afterEach(() => {
  useAssistantUiStore.setState({ activeConversationId: null });
});

describe('useActiveConversation', () => {
  it('falls back to the most recent conversation without a stored choice', () => {
    const { result } = renderActive([conversation('c2'), conversation('c1')]);
    expect(result.current.activeId).toBe('c2');
  });

  it('keeps the stored choice while it is in the list', () => {
    useAssistantUiStore.setState({ activeConversationId: 'c1' });
    const { result } = renderActive([conversation('c2'), conversation('c1')]);
    expect(result.current.active?.id).toBe('c1');
  });

  it('falls back when the stored conversation was deleted', () => {
    useAssistantUiStore.setState({ activeConversationId: 'gone' });
    const { result } = renderActive([conversation('c2')]);
    expect(result.current.activeId).toBe('c2');
  });

  it('is shared: a choice made in one view shows in the other', () => {
    const list = [conversation('c2'), conversation('c1')];
    const panel = renderActive(list);
    const fullScreen = renderActive(list);

    act(() => panel.result.current.setActiveId('c1'));

    expect(fullScreen.result.current.activeId).toBe('c1');
  });

  it('is null with no conversations', () => {
    const { result } = renderActive([]);
    expect(result.current.active).toBeNull();
  });
});

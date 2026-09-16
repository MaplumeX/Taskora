import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentSseEvent } from '@taskora/shared';

import { invalidateDomainData, subscribeAgentEvents } from '@taskora/api';

import { useAgentStream } from './useAgentStream';

// The SSE transport is faked: tests capture the event handler and dispatch
// events synchronously. invalidateDomainData is observed (not executed) so
// the test asserts the wiring, not its (separately tested) implementation.
vi.mock('@taskora/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@taskora/api')>();
  return {
    ...actual,
    subscribeAgentEvents: vi.fn(),
    invalidateDomainData: vi.fn(),
  };
});

let emit: ((event: AgentSseEvent) => void) | undefined;

beforeEach(() => {
  vi.mocked(subscribeAgentEvents).mockImplementation((_id, onEvent) => {
    emit = onEvent;
    return () => undefined;
  });
  vi.mocked(invalidateDomainData).mockClear();
});

function renderStream(conversationId: string) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const stream = renderHook(() => useAgentStream(conversationId), { wrapper });
  return { queryClient, ...stream };
}

describe('useAgentStream data sync', () => {
  it('invalidates domain caches on data_changed', () => {
    const { queryClient } = renderStream('c1');

    act(() => emit?.({ type: 'data_changed', toolName: 'create_project' }));

    expect(invalidateDomainData).toHaveBeenCalledTimes(1);
    expect(invalidateDomainData).toHaveBeenCalledWith(queryClient);
  });

  it('does not invalidate on read-only tool events', () => {
    renderStream('c1');

    act(() =>
      emit?.({
        type: 'tool_execution_end',
        toolCallId: 'tc1',
        toolName: 'list_projects',
        isError: false,
      }),
    );

    expect(invalidateDomainData).not.toHaveBeenCalled();
  });
});

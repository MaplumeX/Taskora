import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentSseEvent } from '@taskora/shared';

import { invalidateDomainData, subscribeAgentEvents } from '@taskora/api';

import { STREAM_RELEASE_DELAY_MS, resetAgentStreams, useAgentStream } from './useAgentStream';

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
const dispose = vi.fn();

beforeEach(() => {
  vi.mocked(subscribeAgentEvents).mockReset();
  vi.mocked(subscribeAgentEvents).mockImplementation((_id, onEvent) => {
    emit = onEvent;
    return dispose;
  });
  vi.mocked(invalidateDomainData).mockClear();
  dispose.mockClear();
});

afterEach(() => {
  resetAgentStreams();
  vi.useRealTimers();
});

function renderStream(conversationId: string, queryClient = new QueryClient()) {
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

describe('useAgentStream sharing between views', () => {
  it('shares one subscription and live state across consumers', () => {
    const panel = renderStream('c1');
    const fullScreen = renderStream('c1', panel.queryClient);

    expect(subscribeAgentEvents).toHaveBeenCalledTimes(1);

    act(() => emit?.({ type: 'agent_start' }));

    expect(panel.result.current.agentActive).toBe(true);
    expect(fullScreen.result.current.agentActive).toBe(true);
  });

  it('keeps the stream across a view switch within the grace period', () => {
    vi.useFakeTimers();
    const panel = renderStream('c1');
    act(() => emit?.({ type: 'agent_start' }));

    panel.unmount();
    vi.advanceTimersByTime(STREAM_RELEASE_DELAY_MS - 1);
    const fullScreen = renderStream('c1', panel.queryClient);

    expect(subscribeAgentEvents).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(fullScreen.result.current.agentActive).toBe(true);
  });

  it('disposes the subscription after the last consumer is gone', () => {
    vi.useFakeTimers();
    const panel = renderStream('c1');

    panel.unmount();
    vi.advanceTimersByTime(STREAM_RELEASE_DELAY_MS);

    expect(dispose).toHaveBeenCalledTimes(1);

    const again = renderStream('c1', panel.queryClient);
    expect(subscribeAgentEvents).toHaveBeenCalledTimes(2);
    expect(again.result.current.agentActive).toBe(false);
  });
});

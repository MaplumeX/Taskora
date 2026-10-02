import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationDto } from '@taskora/shared';

import { agentKeys, i18n, useAssistantUiStore } from '@taskora/api';

import { AssistantPanel, useDockToPanel } from './AssistantPanel';

// The chat view opens an SSE stream; the panel only decides which
// conversation it shows.
vi.mock('./AgentChatView', () => ({
  AgentChatView: ({ conversationId, variant }: { conversationId: string; variant?: string }) => (
    <div data-testid="chat" data-variant={variant}>
      {conversationId}
    </div>
  ),
}));

/** Viewport width drives the panel mode: md (768) and the 1440 push breakpoint. */
function mockViewport(width: number): () => void {
  const original = window.matchMedia;
  window.matchMedia = (query: string) =>
    ({
      matches: Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity) <= width,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  return () => {
    window.matchMedia = original;
  };
}

function conversation(id: string, title: string): ConversationDto {
  return { id, title, createdAt: '', updatedAt: '' };
}

function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>go {to}</button>;
}

function Path() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function Dock() {
  return <button onClick={useDockToPanel()}>dock</button>;
}

function renderShell(path: string, entries: string[] = [path]) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(agentKeys.conversations, [
    conversation('c2', 'Weekly review'),
    conversation('c1', 'Inbox cleanup'),
  ]);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <GoTo to="/agent" />
                <GoTo to="/today" />
                <Dock />
                <Path />
                <AssistantPanel />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const panel = () => screen.queryByRole('complementary', { name: 'Assistant panel' });
const backdrop = () => screen.queryByTestId('assistant-panel-backdrop');

let restoreViewport: () => void = () => {};

beforeEach(() => {
  void i18n.changeLanguage('en');
  useAssistantUiStore.setState({ panelOpen: true, activeConversationId: null, panelWidth: 360 });
});

afterEach(() => restoreViewport());

describe('AssistantPanel — layout modes', () => {
  it('pushes the content on wide viewports (no backdrop)', () => {
    restoreViewport = mockViewport(1600);
    renderShell('/today');
    expect(panel()).toBeInTheDocument();
    expect(panel()).not.toHaveClass('fixed');
    expect(backdrop()).toBeNull();
    expect(screen.getByTestId('chat')).toHaveAttribute('data-variant', 'panel');
  });

  it('floats over the content below 1440px; Esc and the backdrop close it', () => {
    restoreViewport = mockViewport(1280);
    renderShell('/today');
    expect(panel()).toHaveClass('fixed');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useAssistantUiStore.getState().panelOpen).toBe(false);

    act(() => useAssistantUiStore.setState({ panelOpen: true }));
    fireEvent.pointerDown(backdrop()!);
    expect(useAssistantUiStore.getState().panelOpen).toBe(false);
  });

  it('floats over the calendar even on wide viewports', () => {
    restoreViewport = mockViewport(1600);
    renderShell('/calendar');
    expect(backdrop()).toBeInTheDocument();
  });

  it('is absent on mobile and when closed', () => {
    restoreViewport = mockViewport(500);
    renderShell('/today');
    expect(panel()).toBeNull();
  });
});

describe('AssistantPanel — full-screen interplay', () => {
  beforeEach(() => {
    restoreViewport = mockViewport(1600);
  });

  it('closes when the full-screen view opens', async () => {
    renderShell('/today');
    await userEvent.click(screen.getByRole('button', { name: 'go /agent' }));
    expect(panel()).toBeNull();
    expect(useAssistantUiStore.getState().panelOpen).toBe(false);
  });

  it('"Open full screen" goes to /agent and closes the panel', async () => {
    renderShell('/today');
    await userEvent.click(screen.getByRole('button', { name: 'Open full screen' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/agent');
    expect(useAssistantUiStore.getState().panelOpen).toBe(false);
  });

  it('docking from /agent goes back and reopens the panel', async () => {
    useAssistantUiStore.setState({ panelOpen: false });
    renderShell('/agent', ['/upcoming', '/agent']);
    await userEvent.click(screen.getByRole('button', { name: 'dock' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/upcoming');
    expect(panel()).toBeInTheDocument();
  });

  it('docking without history lands on Today with the panel open', async () => {
    useAssistantUiStore.setState({ panelOpen: false });
    renderShell('/agent');
    await userEvent.click(screen.getByRole('button', { name: 'dock' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
    expect(panel()).toBeInTheDocument();
  });
});

describe('AssistantPanel — conversations', () => {
  beforeEach(() => {
    restoreViewport = mockViewport(1600);
  });

  it('shows the shared active conversation and switches from the title menu', async () => {
    renderShell('/today');
    expect(screen.getByTestId('chat')).toHaveTextContent('c2');

    await userEvent.click(screen.getByRole('button', { name: /Weekly review/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Inbox cleanup' }));

    expect(useAssistantUiStore.getState().activeConversationId).toBe('c1');
    expect(screen.getByTestId('chat')).toHaveTextContent('c1');
  });
});

describe('AssistantPanel — resizing', () => {
  const handle = () => screen.getByRole('separator', { name: 'Resize panel' });

  beforeEach(() => {
    restoreViewport = mockViewport(1600);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    // jsdom lacks pointer capture.
    HTMLElement.prototype.setPointerCapture = () => {};
  });

  it('dragging the left edge widens the panel; the store is written on release', () => {
    renderShell('/today');
    fireEvent.pointerDown(handle(), { button: 0, clientX: 1240, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 1140, pointerId: 1 });

    expect(panel()).toHaveStyle({ width: '460px' });
    expect(useAssistantUiStore.getState().panelWidth).toBe(360);

    fireEvent.pointerUp(handle(), { pointerId: 1 });
    expect(useAssistantUiStore.getState().panelWidth).toBe(460);
  });

  it('clamps to the minimum and to half the viewport', () => {
    renderShell('/today');
    fireEvent.pointerDown(handle(), { button: 0, clientX: 1240, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 1500, pointerId: 1 });
    expect(panel()).toHaveStyle({ width: '320px' });
    fireEvent.pointerMove(handle(), { clientX: 0, pointerId: 1 });
    expect(panel()).toHaveStyle({ width: '800px' });
    fireEvent.pointerUp(handle(), { pointerId: 1 });
  });

  it('double-click restores the default; arrow keys step the width', () => {
    useAssistantUiStore.setState({ panelWidth: 520 });
    renderShell('/today');
    fireEvent.doubleClick(handle());
    expect(useAssistantUiStore.getState().panelWidth).toBe(360);

    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(useAssistantUiStore.getState().panelWidth).toBe(376);
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(useAssistantUiStore.getState().panelWidth).toBe(360);
  });
});

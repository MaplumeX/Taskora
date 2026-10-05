import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationDto } from '@taskora/shared';

import { agentKeys, i18n, useAssistantUiStore, useSidebarUiStore } from '@taskora/api';

import { AssistantPanel, useDockToPanel, useSidebarYieldsToPanel } from './AssistantPanel';

// The chat view opens an SSE stream; the panel only decides which
// conversation it shows.
vi.mock('./AgentChatView', () => ({
  AgentChatView: ({ conversationId, variant }: { conversationId: string; variant?: string }) => (
    <div data-testid="chat" data-variant={variant}>
      {conversationId}
    </div>
  ),
}));

/** Viewport width: desktop (md, 768) vs mobile, and the room left beside the panel. */
function mockViewport(width: number): () => void {
  const original = window.matchMedia;
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
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
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
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

function SidebarYields() {
  useSidebarYieldsToPanel();
  return null;
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
                <SidebarYields />
                <AssistantPanel />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sidebarCollapsed = () => useSidebarUiStore.getState().collapsed;
const panel = () => screen.queryByRole('complementary', { name: 'Assistant panel' });

let restoreViewport: () => void = () => {};

beforeEach(() => {
  void i18n.changeLanguage('en');
  useAssistantUiStore.setState({ panelOpen: true, activeConversationId: null, panelWidth: 360 });
  useSidebarUiStore.setState({ width: 240, collapsed: false, autoCollapsed: false });
});

afterEach(() => restoreViewport());

describe('AssistantPanel — layout modes', () => {
  it('sits beside the content on wide viewports', () => {
    restoreViewport = mockViewport(1600);
    renderShell('/today');
    expect(panel()).toBeInTheDocument();
    expect(panel()).not.toHaveClass('fixed');
    expect(screen.getByTestId('chat')).toHaveAttribute('data-variant', 'panel');
  });

  it('never floats over the content: narrow windows and the calendar push too', () => {
    restoreViewport = mockViewport(1024);
    renderShell('/calendar');
    expect(panel()).not.toHaveClass('fixed');

    // Esc belongs to the content beside the panel, not to the panel.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useAssistantUiStore.getState().panelOpen).toBe(true);
  });

  it('keeps the sidebar while sidebar + content + panel fit', () => {
    restoreViewport = mockViewport(1280);
    renderShell('/today');
    expect(sidebarCollapsed()).toBe(false);
  });

  it('collapses the sidebar when the window is too narrow, and brings it back on close', () => {
    restoreViewport = mockViewport(1024);
    renderShell('/today');
    expect(sidebarCollapsed()).toBe(true);

    act(() => useAssistantUiStore.setState({ panelOpen: false }));
    expect(sidebarCollapsed()).toBe(false);
  });

  it('a wider panel or sidebar collapses the sidebar sooner', () => {
    useAssistantUiStore.setState({ panelWidth: 600 });
    restoreViewport = mockViewport(1280);
    renderShell('/today');
    expect(sidebarCollapsed()).toBe(true);
  });

  it('leaves a sidebar the user collapsed by hand alone', () => {
    useSidebarUiStore.setState({ collapsed: true });
    restoreViewport = mockViewport(1024);
    renderShell('/today');
    act(() => useAssistantUiStore.setState({ panelOpen: false }));
    expect(sidebarCollapsed()).toBe(true);
  });

  it('once the user reopens the sidebar it stays, and resizing it never collapses it', () => {
    restoreViewport = mockViewport(1024);
    renderShell('/today');
    act(() => useSidebarUiStore.getState().setCollapsed(false));
    act(() => useSidebarUiStore.getState().setWidth(400));
    expect(sidebarCollapsed()).toBe(false);

    act(() => useAssistantUiStore.setState({ panelOpen: false }));
    expect(sidebarCollapsed()).toBe(false);
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

  it('never squeezes the content below its minimum width', () => {
    restoreViewport();
    restoreViewport = mockViewport(1024);
    renderShell('/today');
    fireEvent.pointerDown(handle(), { button: 0, clientX: 664, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 0, pointerId: 1 });
    // 1024 − 560 content minimum, tighter than half the viewport (512).
    expect(panel()).toHaveStyle({ width: '464px' });
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

import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MobileTabBar } from './MobileTabBar';

function setup(initialEntry = '/today') {
  const onOpenDrawer = vi.fn();
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MobileTabBar onOpenDrawer={onOpenDrawer} />
    </MemoryRouter>,
  );
  return { onOpenDrawer };
}

describe('MobileTabBar', () => {
  it('renders the 4 tab links and the more button', () => {
    setup('/today');

    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute(
      'href',
      '/today',
    );
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    );
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      '/calendar',
    );
    expect(screen.getByRole('link', { name: 'Anytime' })).toHaveAttribute(
      'href',
      '/anytime',
    );
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    setup('/inbox');

    const inbox = screen.getByRole('link', { name: 'Inbox' });
    expect(inbox.className).toContain('text-foreground');
    const today = screen.getByRole('link', { name: 'Today' });
    expect(today.className).toContain('text-muted-foreground');
  });

  it('highlights the more button on drawer routes', () => {
    setup('/logbook');

    const more = screen.getByRole('button', { name: 'More' });
    expect(more.className).toContain('text-foreground');
  });

  it('does not highlight the more button on tab routes', () => {
    setup('/today');

    const more = screen.getByRole('button', { name: 'More' });
    expect(more.className).not.toContain('text-foreground');
  });

  it('calls onOpenDrawer when the more button is clicked', () => {
    const { onOpenDrawer } = setup('/today');

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onOpenDrawer).toHaveBeenCalledOnce();
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarSubscriptionDto } from '@taskora/shared';

import SettingsCalendars from './SettingsCalendars';

const mocks = vi.hoisted(() => ({
  subscriptions: [] as CalendarSubscriptionDto[],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useCalendarSubscriptions: () => ({ data: mocks.subscriptions, isLoading: false }),
  useCreateCalendarSubscription: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateCalendarSubscription: () => ({ mutate: mocks.update, isPending: false }),
  useDeleteCalendarSubscription: () => ({ mutate: mocks.remove, isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function subscription(overrides: Partial<CalendarSubscriptionDto> = {}): CalendarSubscriptionDto {
  return {
    id: 'sub-1',
    name: 'Work',
    url: 'https://example.com/work.ics',
    color: 'blue',
    enabled: true,
    lastFetchedAt: '2026-10-10T08:00:00.000Z',
    lastError: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SettingsCalendars', () => {
  beforeEach(() => {
    mocks.subscriptions = [];
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.remove.mockReset();
  });

  it('adds a subscription from the pasted link and optional name', async () => {
    const user = userEvent.setup();
    render(<SettingsCalendars />);
    expect(screen.getByText('No calendars subscribed yet')).toBeInTheDocument();

    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('Subscription link'), ' webcal://example.com/a.ics ');
    await user.type(screen.getByLabelText('Name (optional)'), 'Family');
    await user.click(add);

    expect(mocks.create).toHaveBeenCalledWith(
      { url: 'webcal://example.com/a.ics', name: 'Family' },
      expect.anything(),
    );
  });

  it('shows why the server rejected the link', async () => {
    mocks.create.mockImplementation((_data, options: { onError: (e: unknown) => void }) =>
      options.onError({ response: { data: { message: 'http_error:404' } } }),
    );
    const user = userEvent.setup();
    render(<SettingsCalendars />);
    await user.type(screen.getByLabelText('Subscription link'), 'https://example.com/x.ics');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('The calendar server returned an error (HTTP 404)'),
    ).toBeInTheDocument();
  });

  it('toggles, recolors and removes a subscription, and shows fetch errors', async () => {
    mocks.subscriptions = [subscription({ lastError: 'not_ics' })];
    const user = userEvent.setup();
    render(<SettingsCalendars />);

    const item = document.querySelector<HTMLElement>('[data-calendar-subscription="sub-1"]')!;
    expect(within(item).getByText('Work')).toBeInTheDocument();
    expect(within(item).getByText('The link did not return an iCal calendar')).toBeInTheDocument();

    await user.click(within(item).getByRole('switch', { name: 'Show events from this calendar' }));
    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'sub-1', data: { enabled: false } },
      expect.anything(),
    );

    await user.click(within(item).getByRole('radio', { name: 'Green' }));
    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'sub-1', data: { color: 'green' } },
      expect.anything(),
    );

    await user.click(within(item).getByRole('button', { name: 'Remove' }));
    expect(mocks.remove).toHaveBeenCalledWith('sub-1', expect.anything());
  });
});

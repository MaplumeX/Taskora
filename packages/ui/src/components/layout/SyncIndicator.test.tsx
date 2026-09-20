import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useSyncStatusStore } from '@taskora/api';

import { SyncIndicator } from './SyncIndicator';

beforeEach(() => {
  useSyncStatusStore.setState({ status: 'idle', pendingCount: 0 });
});

describe('SyncIndicator（V2：离线可见性）', () => {
  it('web（无 Engine）：idle 不渲染', () => {
    const { container } = render(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('同步中 / 已同步：呈现状态、不拦截操作（pointer-events-none）', () => {
    useSyncStatusStore.setState({ status: 'syncing' });
    const { rerender } = render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveAttribute('data-sync-status', 'syncing');

    useSyncStatusStore.setState({ status: 'synced' });
    rerender(<SyncIndicator />);
    const synced = screen.getByRole('status');
    expect(synced).toHaveAttribute('data-sync-status', 'synced');
    expect(synced.className).toContain('pointer-events-none');
  });

  it('离线：显示待同步条数，由 sync 成败驱动而非 navigator.onLine', () => {
    useSyncStatusStore.setState({ status: 'offline', pendingCount: 3 });
    render(<SyncIndicator />);
    const offline = screen.getByRole('status');
    expect(offline).toHaveAttribute('data-sync-status', 'offline');
    expect(offline.textContent).toContain('3');
  });
});

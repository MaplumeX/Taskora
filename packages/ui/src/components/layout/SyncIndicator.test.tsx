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

  it('同步中 / 已同步：正常态不渲染，不遮挡内容', () => {
    useSyncStatusStore.setState({ status: 'syncing' });
    const { container, rerender } = render(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();

    useSyncStatusStore.setState({ status: 'synced' });
    rerender(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('离线：显示待同步条数，由 sync 成败驱动而非 navigator.onLine', () => {
    useSyncStatusStore.setState({ status: 'offline', pendingCount: 3 });
    render(<SyncIndicator />);
    const offline = screen.getByRole('status');
    expect(offline).toHaveAttribute('data-sync-status', 'offline');
    expect(offline.textContent).toContain('3');
    expect(offline.className).toContain('pointer-events-none');
  });

  it('需要升级：常驻提示（hub 要求更高协议版本或副本来自更新版本）', () => {
    useSyncStatusStore.setState({ status: 'upgrade-required', pendingCount: 2 });
    render(<SyncIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-sync-status', 'upgrade-required');
    expect(status.className).toContain('pointer-events-none');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { areaKeys, i18n, projectKeys, tagKeys } from '@taskora/api';

import type { QuickAddHost } from './host';
import { CONTINUOUS_KEY, QuickAddOverlay, closeOpenPicker } from './QuickAddOverlay';

function createHost(): QuickAddHost & { [K in keyof QuickAddHost]: ReturnType<typeof vi.fn> } {
  return {
    getSnapshot: vi.fn(() => null),
    isSystemDark: vi.fn(() => false),
    ready: vi.fn(),
    submit: vi.fn(),
    dismiss: vi.fn(),
  };
}

function renderOverlay(host = createHost()) {
  // 同 main.tsx：实体来自快照写进的查询缓存，不请求 REST。
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(projectKeys.all, []);
  queryClient.setQueryData(areaKeys.all, []);
  queryClient.setQueryData(tagKeys.all, []);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <QuickAddOverlay host={host} />
    </QueryClientProvider>,
  );
  return { host, view, title: screen.getByRole('textbox', { name: 'New task' }) };
}

const user = userEvent.setup();

beforeEach(() => {
  window.localStorage.clear();
  void i18n.changeLanguage('en');
});

describe('QuickAddOverlay', () => {
  it('挂载后聚焦标题并通知原生进场', () => {
    const { host, title } = renderOverlay();
    expect(title).toHaveFocus();
    expect(host.ready).toHaveBeenCalledTimes(1);
  });

  it('「添加」把草稿 JSON 交给原生并关闭；空标题时按钮不可用', async () => {
    const { host, title } = renderOverlay();
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();

    await user.type(title, 'Buy milk');
    await user.click(add);
    expect(host.submit).toHaveBeenCalledWith(JSON.stringify({ title: 'Buy milk' }), 'close');
  });

  it('「在应用中继续」带 openInApp 标记', async () => {
    const { host, title } = renderOverlay();
    await user.type(title, 'Plan trip');
    await user.click(screen.getByRole('button', { name: 'Continue in app' }));
    expect(host.submit).toHaveBeenCalledWith(
      JSON.stringify({ title: 'Plan trip', openInApp: true }),
      'openInApp',
    );
  });

  it('连续添加：开关记在本机，回车提交后浮层留着并提示', async () => {
    const { host, title } = renderOverlay();
    const toggle = screen.getByRole('button', { name: 'Keep adding' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(CONTINUOUS_KEY)).toBe('1');

    await user.type(title, 'One{Enter}');
    expect(host.submit).toHaveBeenCalledWith(JSON.stringify({ title: 'One' }), 'continue');
    expect(title).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('Added');
    expect(host.dismiss).not.toHaveBeenCalled();
  });

  it('点卡片外的空白处关闭', async () => {
    const { host, view } = renderOverlay();
    await user.click(view.container.firstElementChild as HTMLElement);
    expect(host.dismiss).toHaveBeenCalledTimes(1);
  });

  it('返回键：有选择器开着时只关选择器，否则交给原生关闭', async () => {
    renderOverlay();
    expect(closeOpenPicker()).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Where' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(closeOpenPicker()).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

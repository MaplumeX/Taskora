import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { requestNavigation, useNavigationRequestStore } from '@/stores/navigationRequest.store';
import { useNavigationRequestListener } from './useNavigationRequest';

function Probe() {
  useNavigationRequestListener();
  const { pathname } = useLocation();
  return <div data-testid="path">{pathname}</div>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/inbox']}>
      <Probe />
    </MemoryRouter>,
  );
}

describe('useNavigationRequestListener — 平台壳投递的路由请求', () => {
  beforeEach(() => {
    useNavigationRequestStore.setState({ pendingPath: null });
  });

  it('请求早于挂载（点通知冷启动）：挂载后执行并清空待处理状态', async () => {
    requestNavigation('/today');
    renderShell();

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/today'));
    expect(useNavigationRequestStore.getState().pendingPath).toBeNull();
  });

  it('挂载后投递请求：导航到目标路由并消费请求', async () => {
    renderShell();
    act(() => requestNavigation('/today'));

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/today'));
    expect(useNavigationRequestStore.getState().pendingPath).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useMultiSelectStore, useUiInteractionStore } from '@taskora/api';

import { MainContent, isPullToFindRoute } from './MainContent';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useCurrentUser: vi.fn(),
  useCalendarQueryRefresh: vi.fn(),
}));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<MainContent />}>
          <Route path="*" element={<div>page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole('main');
}

function pullDown(main: HTMLElement) {
  fireEvent.touchStart(main, { touches: [{ clientX: 100, clientY: 10 }] });
  act(() => vi.advanceTimersByTime(30));
  fireEvent.touchMove(main, { touches: [{ clientX: 100, clientY: 200 }] });
  fireEvent.touchEnd(main, { touches: [] });
}

describe('MainContent — 下拉打开 Quick Find', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUiInteractionStore.setState({ searchOpen: false, searchSeed: null });
    useMultiSelectStore.setState({ active: false, ids: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('列表页下拉越过阈值松手：打开 Quick Find', () => {
    pullDown(renderAt('/today'));
    expect(useUiInteractionStore.getState().searchOpen).toBe(true);
  });

  it('下拉过程中顶部露出搜索指示器', () => {
    const main = renderAt('/projects/p1');
    fireEvent.touchStart(main, { touches: [{ clientX: 100, clientY: 10 }] });
    act(() => vi.advanceTimersByTime(30));
    fireEvent.touchMove(main, { touches: [{ clientX: 100, clientY: 200 }] });
    expect(screen.getByTestId('pull-to-find')).toHaveAttribute('data-armed', 'true');
    fireEvent.touchEnd(main, { touches: [] });
    expect(screen.queryByTestId('pull-to-find')).toBeNull();
  });

  it('日历与助手页不生效', () => {
    pullDown(renderAt('/calendar'));
    expect(useUiInteractionStore.getState().searchOpen).toBe(false);
  });

  it('多选模式中不生效', () => {
    useMultiSelectStore.setState({ active: true, ids: ['t1'] });
    pullDown(renderAt('/today'));
    expect(useUiInteractionStore.getState().searchOpen).toBe(false);
  });
});

describe('isPullToFindRoute', () => {
  it('列表类页面生效，其余不生效', () => {
    for (const path of [
      '/home',
      '/today',
      '/trash',
      '/tags',
      '/tags/g1',
      '/projects/p1',
      '/areas/a1',
    ]) {
      expect(isPullToFindRoute(path), path).toBe(true);
    }
    for (const path of ['/calendar', '/agent', '/settings', '/projects']) {
      expect(isPullToFindRoute(path), path).toBe(false);
    }
  });
});

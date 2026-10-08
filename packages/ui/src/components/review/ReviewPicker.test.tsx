import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n, todayDateKey, usePreferencesStore } from '@taskora/api';
import { addReviewInterval } from '@taskora/shared';

import { ReviewPicker, type ReviewTarget } from './ReviewSchedule';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useUpdateProject: () => ({ mutate: updateProject }),
  useUpdateArea: () => ({ mutate: updateArea }),
  useMarkProjectReviewed: () => ({ mutate: vi.fn() }),
  useMarkAreaReviewed: () => ({ mutate: vi.fn() }),
}));

const updateProject = vi.hoisted(() => vi.fn());
const updateArea = vi.hoisted(() => vi.fn());

function renderPicker(target: ReviewTarget) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewPicker target={target} />
    </QueryClientProvider>,
  );
}

describe('ReviewPicker（「…」菜单里的回顾选择器）', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    usePreferencesStore.setState({
      defaultReviewIntervals: {
        project: { unit: 'week', count: 1 },
        area: { unit: 'month', count: 3 },
      },
    });
  });

  it('显示对象自己的间隔；步进数字、切单位即写入', () => {
    renderPicker({
      kind: 'project',
      id: 'p1',
      reviewInterval: { unit: 'week', count: 2 },
      nextReviewDate: '2026-12-01',
    });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'weeks' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Increase review interval' }));
    expect(updateProject).toHaveBeenLastCalledWith(
      { id: 'p1', data: { reviewInterval: { unit: 'week', count: 3 } } },
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'months' }));
    expect(updateProject).toHaveBeenLastCalledWith(
      { id: 'p1', data: { reviewInterval: { unit: 'month', count: 2 } } },
      expect.anything(),
    );
  });

  it('间隔为空（存量数据）时按该对象类型的默认间隔显示，改动写入明确值', () => {
    renderPicker({ kind: 'area', id: 'a1', reviewInterval: null, nextReviewDate: '2026-12-01' });
    expect(screen.getByRole('radio', { name: 'months' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Increase review interval' }));
    expect(updateArea).toHaveBeenCalledWith(
      { id: 'a1', data: { reviewInterval: { unit: 'month', count: 4 } } },
      expect.anything(),
    );
  });

  it('下次回顾日的快捷选项只改日期；显示上次回顾日；不提供标记已回顾', () => {
    renderPicker({
      kind: 'project',
      id: 'p1',
      reviewInterval: null,
      nextReviewDate: '2026-12-01',
      lastReviewedOn: null,
    });
    fireEvent.click(screen.getByRole('button', { name: /In 1 month/ }));
    expect(updateProject).toHaveBeenCalledWith(
      {
        id: 'p1',
        data: { nextReviewDate: addReviewInterval(todayDateKey(), { unit: 'month', count: 1 }) },
      },
      expect.anything(),
    );
    expect(screen.getByText('Last reviewed: never')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark Reviewed/ })).not.toBeInTheDocument();
  });
});

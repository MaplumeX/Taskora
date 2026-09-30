import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

import { TaskList } from './TaskList';

const noop = () => undefined;

describe('TaskList empty state', () => {
  it('默认在空列表上显示空状态（可自定义提示）', () => {
    render(<TaskList tasks={[]} onToggleComplete={noop} emptyHint="该区域下没有任务" />);
    expect(screen.getByText('该区域下没有任务')).toBeInTheDocument();
  });

  it('hideEmptyState 时不渲染空状态与占位', () => {
    const { container } = render(<TaskList tasks={[]} onToggleComplete={noop} hideEmptyState />);
    expect(container).toBeEmptyDOMElement();
  });
});

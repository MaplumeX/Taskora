import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskRepeatBadge } from './TaskRepeatBadge';

describe('TaskRepeatBadge（recurring-tasks spec）', () => {
  it('设了规则时渲染 ↻ 徽标', () => {
    render(<TaskRepeatBadge repeatRule={{ unit: 'day', interval: 1, anchor: 'scheduled' }} />);
    expect(screen.getByText('', { selector: '[data-repeat-badge]' })).toBeInTheDocument();
  });

  it('repeatRule 为 null / undefined 时不渲染', () => {
    const { container, rerender } = render(<TaskRepeatBadge repeatRule={null} />);
    expect(container.querySelector('[data-repeat-badge]')).toBeNull();
    rerender(<TaskRepeatBadge repeatRule={undefined} />);
    expect(container.querySelector('[data-repeat-badge]')).toBeNull();
  });
});

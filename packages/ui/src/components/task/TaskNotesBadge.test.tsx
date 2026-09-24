import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskNotesBadge } from './TaskNotesBadge';

describe('TaskNotesBadge', () => {
  it('有备注时渲染便签徽标', () => {
    render(<TaskNotesBadge notes="买牛奶" />);
    expect(screen.getByText('', { selector: '[data-notes-badge]' })).toBeInTheDocument();
  });

  it('notes 为空字符串 / 纯空白 / null / undefined 时不渲染', () => {
    const { container, rerender } = render(<TaskNotesBadge notes="" />);
    expect(container.querySelector('[data-notes-badge]')).toBeNull();
    rerender(<TaskNotesBadge notes="   " />);
    expect(container.querySelector('[data-notes-badge]')).toBeNull();
    rerender(<TaskNotesBadge notes={null} />);
    expect(container.querySelector('[data-notes-badge]')).toBeNull();
    rerender(<TaskNotesBadge notes={undefined} />);
    expect(container.querySelector('[data-notes-badge]')).toBeNull();
  });
});

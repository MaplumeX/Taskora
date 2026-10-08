import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AreaResponseDto, TagResponseDto } from '@taskora/shared';

import { AreaMetaRow } from './AreaMetaRow';

const mutationMocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useUpdateArea: () => ({ mutate: mutationMocks.update }),
  useUpdateProject: () => ({ mutate: vi.fn() }),
  useMarkProjectReviewed: () => ({ mutate: vi.fn() }),
  useMarkAreaReviewed: () => ({ mutate: vi.fn() }),
  useTagsQuery: () => ({
    data: [tagA, tagB].map((t) => ({ ...t })),
  }),
  useCreateTag: () => ({ mutate: vi.fn(), isPending: false }),
}));

const tagA: TagResponseDto = {
  id: 'tag-a',
  title: 'design',
  color: '#3B82F6',
  parentId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const tagB: TagResponseDto = {
  id: 'tag-b',
  title: 'urgent',
  color: '#EF4444',
  parentId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const baseArea: AreaResponseDto = {
  id: 'area-1',
  title: 'Work',
  notes: null,
  tags: [tagA],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('AreaMetaRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tag dots and the next review badge', () => {
    render(<AreaMetaRow area={baseArea} />);

    expect(screen.getByTitle('design')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next review' })).toHaveTextContent('Today');
  });

  it('renders only the next review badge when the area has no tags', () => {
    render(<AreaMetaRow area={{ ...baseArea, tags: [] }} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Next review');
  });

  it('opens the tags popover and toggles a tag selection', async () => {
    const user = userEvent.setup();
    render(<AreaMetaRow area={baseArea} />);

    await user.click(screen.getByTitle('design').closest('button')!);
    await user.click(screen.getByRole('option', { name: 'urgent' }));
    await waitFor(() => {
      expect(mutationMocks.update).toHaveBeenCalledWith(
        { id: 'area-1', data: { tagIds: ['tag-a', 'tag-b'] } },
        expect.anything(),
      );
    });
  });
});

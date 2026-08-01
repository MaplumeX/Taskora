import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectHeadingResponseDto } from '@taskora/shared';

import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { ProjectHeadingRow } from './ProjectHeadingRow';

const mutationMocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  convert: vi.fn(),
}));

vi.mock('@/lib/hooks/useProjectHeadings', () => ({
  useUpdateProjectHeading: () => ({ mutate: mutationMocks.update }),
  useDeleteProjectHeading: () => ({
    mutate: mutationMocks.remove,
    isPending: false,
  }),
  useConvertProjectHeadingToProject: () => ({
    mutate: mutationMocks.convert,
    isPending: false,
  }),
}));

const heading: ProjectHeadingResponseDto = {
  id: 'heading-1',
  projectId: 'project-1',
  title: 'Build',
  sortOrder: 0,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

describe('ProjectHeadingRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiInteractionStore.setState({ pendingAutoEditId: null });
  });

  it('provides an accessible inline editor and commits a renamed heading', async () => {
    const user = userEvent.setup();
    render(<ProjectHeadingRow heading={heading} />);

    await user.click(screen.getByRole('button', { name: 'Build' }));
    const input = screen.getByRole('textbox', {
      name: /New heading|新标题/,
    });
    await user.clear(input);
    await user.type(input, 'Release');
    fireEvent.blur(input);

    expect(mutationMocks.update).toHaveBeenCalledWith(
      { id: 'heading-1', data: { title: 'Release' } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('consumes pending auto-edit state and focuses a newly created empty heading', async () => {
    useUiInteractionStore.setState({ pendingAutoEditId: heading.id });
    render(<ProjectHeadingRow heading={{ ...heading, title: '' }} />);

    const input = screen.getByRole('textbox', {
      name: /New heading|新标题/,
    });
    await waitFor(() => expect(input).toHaveFocus());
    expect(useUiInteractionStore.getState().pendingAutoEditId).toBeNull();
  });

  it('requires destructive confirmation before deleting a heading', async () => {
    const user = userEvent.setup();
    render(<ProjectHeadingRow heading={heading} />);

    await user.click(
      screen.getByRole('button', {
        name: /Heading actions|标题操作/,
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: /Delete heading|删除标题/,
      }),
    );

    expect(
      screen.getByRole('dialog', {
        name: /Delete this heading|删除这个标题/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/including their subtasks|及其子任务/)).toBeInTheDocument();
    expect(mutationMocks.remove).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', {
        name: /Delete heading|删除标题/,
      }),
    );
    expect(mutationMocks.remove).toHaveBeenCalledWith(
      'heading-1',
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('converts the heading to a project from the actions menu', async () => {
    const user = userEvent.setup();
    render(<ProjectHeadingRow heading={heading} />);

    await user.click(
      screen.getByRole('button', {
        name: /Heading actions|标题操作/,
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: /Convert to Project|转换为项目/,
      }),
    );

    expect(mutationMocks.convert).toHaveBeenCalledWith(
      'heading-1',
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });
});

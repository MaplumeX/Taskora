import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectHeadingResponseDto } from '@taskora/shared';
import { HeadingStatus } from '@taskora/shared';

import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { ProjectHeadingRow } from './ProjectHeadingRow';

const mutationMocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  convert: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
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
  useArchiveProjectHeading: () => ({
    mutate: mutationMocks.archive,
    isPending: false,
  }),
  useUnarchiveProjectHeading: () => ({
    mutate: mutationMocks.unarchive,
    isPending: false,
  }),
}));

const heading: ProjectHeadingResponseDto = {
  id: 'heading-1',
  projectId: 'project-1',
  title: 'Build',
  sortOrder: 0,
  status: HeadingStatus.ACTIVE,
  completedAt: null,
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

  it('archives the heading from the actions menu', async () => {
    const user = userEvent.setup();
    render(<ProjectHeadingRow heading={heading} />);

    await user.click(
      screen.getByRole('button', {
        name: /Heading actions|标题操作/,
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', {
        name: /Archive|归档/,
      }),
    );

    expect(mutationMocks.archive).toHaveBeenCalledWith(
      'heading-1',
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  /* --------------------------- archived-state variant --------------------------- */

  const archivedHeading: ProjectHeadingResponseDto = {
    ...heading,
    status: HeadingStatus.COMPLETED,
    completedAt: '2026-07-31T00:00:00.000Z',
  };

  it('hides the drag handle for an archived heading', () => {
    render(<ProjectHeadingRow heading={archivedHeading} />);
    expect(
      screen.queryByRole('button', { name: /Drag heading|拖动标题/ }),
    ).not.toBeInTheDocument();
  });

  it('shows Unarchive (not Archive) in the menu for an archived heading', async () => {
    const user = userEvent.setup();
    render(<ProjectHeadingRow heading={archivedHeading} />);

    await user.click(
      screen.getByRole('button', { name: /Heading actions|标题操作/ }),
    );

    expect(
      await screen.findByRole('menuitem', { name: /Unarchive|取消归档/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /^Archive$|^归档$/ }),
    ).not.toBeInTheDocument();
  });

  it('unarchives the heading from the actions menu', async () => {
    const user = userEvent.setup();
    render(<ProjectHeadingRow heading={archivedHeading} />);

    await user.click(
      screen.getByRole('button', { name: /Heading actions|标题操作/ }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /Unarchive|取消归档/ }),
    );

    expect(mutationMocks.unarchive).toHaveBeenCalledWith(
      'heading-1',
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });
});

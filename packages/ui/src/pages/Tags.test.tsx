import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

const harness = vi.hoisted(() => ({
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));
vi.mock('sonner', () => ({ toast: Object.assign(harness.toast, { error: vi.fn() }) }));

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, title: string, tagGroupId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', sortOrder: 0, tagGroupId, createdAt: NOW, updatedAt: NOW };
}

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTagsQuery: () => ({
    data: [tag('office', 'Office', 'g-place'), tag('urgent', 'Urgent')],
    isLoading: false,
  }),
  useTagGroupsQuery: () => ({
    data: [
      { id: 'g-place', title: 'Place', sortOrder: 0, tags: [], createdAt: NOW, updatedAt: NOW },
    ],
  }),
  useCreateTag: () => ({ mutate: harness.createTag }),
  useUpdateTag: () => ({ mutate: harness.updateTag }),
  useDeleteTag: () => ({ mutate: harness.deleteTag }),
  useReorderTags: () => ({ mutate: vi.fn() }),
  useCreateTagGroup: () => ({ mutate: harness.createGroup }),
  useUpdateTagGroup: () => ({ mutate: harness.updateGroup }),
  useDeleteTagGroup: () => ({ mutate: harness.deleteGroup }),
  useReorderTagGroups: () => ({ mutate: vi.fn() }),
}));

import Tags from './Tags';

const user = userEvent.setup();
const renderTags = () =>
  render(
    <MemoryRouter>
      <Tags />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Tags 管理页', () => {
  it('Group 小标题下列出成员，未分组在最后', () => {
    renderTags();
    const names = [...document.querySelectorAll('[data-tag-row]')].map((el) =>
      el.getAttribute('data-tag-row'),
    );
    expect(names).toEqual(['office', 'urgent']);
    expect(screen.getByRole('button', { name: 'tag:rename Place' })).toBeInTheDocument();
  });

  it('点名称直接改名，Enter 保存', async () => {
    renderTags();
    await user.click(screen.getByRole('button', { name: 'tag:rename Urgent' }));
    const input = screen.getByDisplayValue('Urgent');
    await user.clear(input);
    await user.type(input, 'ASAP{Enter}');
    expect(harness.updateTag).toHaveBeenCalledWith(
      { id: 'urgent', data: { title: 'ASAP' } },
      expect.anything(),
    );
  });

  it('Group 小标题上的 + 在该组新建标签', async () => {
    renderTags();
    await user.click(screen.getAllByRole('button', { name: 'tag:addTag' })[0]);
    await user.type(screen.getByPlaceholderText('tag:titlePlaceholder'), 'Home{Enter}');
    expect(harness.createTag).toHaveBeenCalledWith(
      { title: 'Home', tagGroupId: 'g-place' },
      expect.anything(),
    );
  });

  it('删除先隐藏，撤销即恢复且不提交；toast 关闭后才删除', async () => {
    renderTags();
    const deleteButtons = () => [
      ...document.querySelectorAll('[data-tag-row="urgent"] button[aria-label="common:delete"]'),
    ];
    await user.click(deleteButtons()[0] as HTMLElement);
    expect(document.querySelector('[data-tag-row="urgent"]')).toBeNull();

    const options = harness.toast.mock.calls[0][1];
    act(() => options.action.onClick());
    act(() => options.onDismiss());
    expect(document.querySelector('[data-tag-row="urgent"]')).not.toBeNull();
    expect(harness.deleteTag).not.toHaveBeenCalled();

    await user.click(deleteButtons()[0] as HTMLElement);
    const second = harness.toast.mock.calls[1][1];
    act(() => second.onAutoClose());
    act(() => second.onDismiss());
    expect(harness.deleteTag).toHaveBeenCalledTimes(1);
    expect(harness.deleteTag).toHaveBeenCalledWith('urgent', expect.anything());
  });
});

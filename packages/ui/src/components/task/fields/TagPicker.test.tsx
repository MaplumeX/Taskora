import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { i18n, useCreateTag, useTagGroupsQuery, useTagsQuery } from '@taskora/api';
import type { TagResponseDto } from '@taskora/shared';

import { TagsField } from './TagsField';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTagsQuery: vi.fn(),
  useTagGroupsQuery: vi.fn(),
  useCreateTag: vi.fn(),
}));

const NOW = '2026-09-01T00:00:00.000Z';

function tag(id: string, title: string, tagGroupId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', tagGroupId, createdAt: NOW, updatedAt: NOW };
}

const user = userEvent.setup();
const createMutate = vi.fn();

function renderField(own: TagResponseDto[] = [], allowCreate?: boolean) {
  const onPatch = vi.fn();
  render(<TagsField current={{ tags: own }} onPatch={onPatch} allowCreate={allowCreate} />);
  return { onPatch, input: screen.getByRole('combobox') };
}

const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  void i18n.changeLanguage('en');
  vi.mocked(useTagsQuery).mockReturnValue({
    data: [tag('urgent', 'Urgent'), tag('office', 'Office', 'g-place')],
  } as never);
  vi.mocked(useTagGroupsQuery).mockReturnValue({
    data: [{ id: 'g-place', title: 'Place', tags: [], createdAt: NOW, updatedAt: NOW }],
  } as never);
  vi.mocked(useCreateTag).mockReturnValue({ mutate: createMutate, isPending: false } as never);
});

describe('TagsField / TagPicker', () => {
  it('按 Group 分节显示，自身已有的 Tag 标为选中', () => {
    renderField([tag('urgent', 'Urgent')]);
    expect(screen.getByText('Place')).toBeInTheDocument();
    expect(optionNames()).toEqual(['Office', 'Urgent']);
    expect(screen.getByRole('option', { name: 'Urgent' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('option', { name: 'Office' })).toHaveAttribute('aria-checked', 'false');
  });

  it('键盘：↓ 移动，Enter 切换且不清空输入', async () => {
    const { onPatch, input } = renderField([tag('urgent', 'Urgent')]);
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPatch).toHaveBeenLastCalledWith({ tagIds: [] });
    await user.keyboard('{ArrowUp}{Enter}');
    expect(onPatch).toHaveBeenLastCalledWith({ tagIds: ['urgent', 'office'] });
  });

  it('搜索过滤；输入新名字回车即新建并打上', async () => {
    createMutate.mockImplementation((_data, { onSuccess }) => onSuccess(tag('trip', 'Trip')));
    const { onPatch, input } = renderField();
    await user.type(input, 'off');
    expect(optionNames()).toEqual(['Office', 'Create “off”']);

    await user.clear(input);
    await user.type(input, 'Trip{Enter}');
    expect(createMutate).toHaveBeenCalledWith({ title: 'Trip' }, expect.anything());
    expect(onPatch).toHaveBeenLastCalledWith({ tagIds: ['trip'] });
    expect(input).toHaveValue('');
  });

  it('allowCreate=false：不出现新建行，回车不新建', async () => {
    const { onPatch, input } = renderField([], false);
    await user.type(input, 'off');
    expect(optionNames()).toEqual(['Office']);

    await user.clear(input);
    await user.type(input, 'Trip{Enter}');
    expect(optionNames()).toEqual([]);
    expect(createMutate).not.toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
  });
});

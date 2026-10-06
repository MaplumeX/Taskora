import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { i18n, useCreateTag, useTagsQuery } from '@taskora/api';
import type { TagResponseDto } from '@taskora/shared';

import { TagsField } from './TagsField';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTagsQuery: vi.fn(),
  useCreateTag: vi.fn(),
}));

const NOW = '2026-09-01T00:00:00.000Z';

function tag(id: string, title: string, parentId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', parentId, createdAt: NOW, updatedAt: NOW };
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
    data: [tag('urgent', 'Urgent'), tag('place', 'Place'), tag('office', 'Office', 'place')],
  } as never);
  vi.mocked(useCreateTag).mockReturnValue({ mutate: createMutate, isPending: false } as never);
});

describe('TagsField / TagPicker', () => {
  it('按 Tag 树列出（父 Tag 也可勾选），自身已有的 Tag 标为选中', () => {
    renderField([tag('urgent', 'Urgent')]);
    expect(optionNames()).toEqual(['Urgent', 'Place', 'Office']);
    expect(screen.getByRole('option', { name: 'Place' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('option', { name: 'Urgent' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('option', { name: 'Office' })).toHaveAttribute('aria-checked', 'false');
  });

  it('键盘：↓ 移动，Enter 切换且不清空输入', async () => {
    const { onPatch, input } = renderField([tag('urgent', 'Urgent')]);
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onPatch).toHaveBeenLastCalledWith({ tagIds: [] });
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onPatch).toHaveBeenLastCalledWith({ tagIds: ['urgent', 'office'] });
    await user.keyboard('{ArrowUp}{Enter}');
    expect(onPatch).toHaveBeenLastCalledWith({ tagIds: ['urgent', 'place'] });
  });

  it('搜索过滤；输入新名字回车即新建并打上', async () => {
    createMutate.mockImplementation((_data, { onSuccess }) => onSuccess(tag('trip', 'Trip')));
    const { onPatch, input } = renderField();
    await user.type(input, 'off');
    // 搜索结果带父路径
    expect(optionNames()).toEqual(['OfficePlace', 'Create “off”']);

    await user.clear(input);
    await user.type(input, 'Trip{Enter}');
    expect(createMutate).toHaveBeenCalledWith({ title: 'Trip' }, expect.anything());
    expect(onPatch).toHaveBeenLastCalledWith({ tagIds: ['trip'] });
    expect(input).toHaveValue('');
  });

  it('allowCreate=false：不出现新建行，回车不新建', async () => {
    const { onPatch, input } = renderField([], false);
    await user.type(input, 'off');
    expect(optionNames()).toEqual(['OfficePlace']);

    await user.clear(input);
    await user.type(input, 'Trip{Enter}');
    expect(optionNames()).toEqual([]);
    expect(createMutate).not.toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
  });
});

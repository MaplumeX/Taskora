import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

const harness = vi.hoisted(() => ({
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  reorderTags: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, title: string, parentId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', parentId, createdAt: NOW, updatedAt: NOW };
}

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTagsQuery: () => ({
    data: [tag('place', 'Place'), tag('office', 'Office', 'place'), tag('urgent', 'Urgent')],
    isLoading: false,
  }),
  useCreateTag: () => ({ mutate: harness.createTag }),
  useUpdateTag: () => ({ mutate: harness.updateTag }),
  useDeleteTag: () => ({ mutate: harness.deleteTag }),
  useReorderTags: () => ({ mutate: harness.reorderTags }),
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
  localStorage.clear();
});

const rowIds = () =>
  [...document.querySelectorAll('[data-tag-row]')].map((el) => el.getAttribute('data-tag-row'));
/** 右键行打开菜单，点其中一项。 */
async function menuAction(tagId: string, label: string) {
  fireEvent.contextMenu(document.querySelector(`[data-tag-row="${tagId}"]`) as HTMLElement);
  await user.click(await screen.findByRole('button', { name: label }));
}

const rowButton = (tagId: string, label: string) =>
  document.querySelector(`[data-tag-row="${tagId}"] button[aria-label="${label}"]`) as HTMLElement;

describe('Tags 管理页', () => {
  it('按 Tag 树列出，子 Tag 缩进；折叠父 Tag 隐藏子树', async () => {
    renderTags();
    expect(rowIds()).toEqual(['place', 'office', 'urgent']);
    await user.click(rowButton('place', 'tag:collapse'));
    expect(rowIds()).toEqual(['place', 'urgent']);
    await user.click(rowButton('place', 'tag:expand'));
    expect(rowIds()).toEqual(['place', 'office', 'urgent']);
  });

  it('行上只有折叠、色点、名称与详情入口；其余操作在右键菜单里', () => {
    renderTags();
    expect(rowButton('place', 'tag:newChild')).toBeNull();
    expect(rowButton('place', 'common:delete')).toBeNull();
    fireEvent.contextMenu(document.querySelector('[data-tag-row="place"]') as HTMLElement);
    expect(screen.getByRole('button', { name: 'tag:newChild' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tag:moveTo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common:delete' })).toBeInTheDocument();
  });

  it('触控左滑弹出动作面板：新建子 Tag、移到…、删除', async () => {
    renderTags();
    const row = document.querySelector('[data-tag-row="urgent"] .touch-pan-y') as HTMLElement;
    const touch = (type: string, x: number) =>
      fireEvent(
        row,
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: 10,
          pointerType: 'touch',
          pointerId: 1,
          button: 0,
        }),
      );
    touch('pointerdown', 300);
    touch('pointermove', 250);
    touch('pointermove', 200);
    touch('pointerup', 200);
    const sheet = await screen.findByRole('dialog', { name: 'Urgent' });
    expect(sheet).toHaveTextContent('tag:newChild');
    expect(sheet).toHaveTextContent('tag:moveTo');
    await user.click(screen.getByRole('button', { name: 'tag:moveTo' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Place' }));
    expect(harness.updateTag).toHaveBeenCalledWith(
      { id: 'urgent', data: { parentId: 'place' } },
      expect.anything(),
    );
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

  it('行上的 + 新建子 Tag；页头按钮新建顶层 Tag', async () => {
    renderTags();
    await menuAction('place', 'tag:newChild');
    await user.type(screen.getByPlaceholderText('tag:titlePlaceholder'), 'Home{Enter}');
    expect(harness.createTag).toHaveBeenCalledWith(
      { title: 'Home', parentId: 'place' },
      expect.anything(),
    );
    await user.click(screen.getByRole('button', { name: 'tag:create' }));
    await user.type(screen.getByPlaceholderText('tag:titlePlaceholder'), 'Later{Enter}');
    expect(harness.createTag).toHaveBeenLastCalledWith(
      { title: 'Later', parentId: null },
      expect.anything(),
    );
  });

  it('移到…：改父 Tag 并按新先序写 Position；自己的后代不可选', async () => {
    renderTags();
    await menuAction('place', 'tag:moveTo');
    expect(screen.queryByRole('menuitemradio', { name: 'Office' })).toBeNull();
    await user.click(screen.getByRole('menuitemradio', { name: 'Urgent' }));
    expect(harness.updateTag).toHaveBeenCalledWith(
      { id: 'place', data: { parentId: 'urgent' } },
      expect.anything(),
    );
    expect(harness.reorderTags).toHaveBeenCalledWith(
      ['urgent', 'place', 'office'],
      expect.anything(),
    );
  });

  it('删除先确认：取消不提交，确认后删除', async () => {
    renderTags();
    await menuAction('urgent', 'common:delete');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('tag:deleteDescription')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'common:cancel' }));
    expect(harness.deleteTag).not.toHaveBeenCalled();

    await menuAction('urgent', 'common:delete');
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'common:delete' }),
    );
    expect(harness.deleteTag).toHaveBeenCalledTimes(1);
    expect(harness.deleteTag).toHaveBeenCalledWith('urgent', expect.anything());
  });

  it('删除父 Tag：确认框说明子 Tag 会移到顶层', async () => {
    renderTags();
    await menuAction('place', 'common:delete');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('tag:deleteDescriptionWithChildren')).toBeInTheDocument();
  });
});

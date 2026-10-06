import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

import { i18n, useTagsQuery } from '@taskora/api';
import type { TagResponseDto } from '@taskora/shared';

import { TagFilterBar, useTagFilter } from './TagFilterBar';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTagsQuery: vi.fn(),
}));

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, title: string, parentId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', parentId, createdAt: NOW, updatedAt: NOW };
}

interface Item {
  id: string;
  tagIds: string[];
}
const effectiveOf = (item: Item) => item.tagIds;

const items: Item[] = [
  { id: 'a', tagIds: ['urgent'] },
  { id: 'b', tagIds: ['office'] },
  { id: 'c', tagIds: ['home'] },
  { id: 'd', tagIds: [] },
  { id: 'e', tagIds: ['place'] },
  { id: 'f', tagIds: ['desk'] },
];

function Page() {
  const { visible, bar } = useTagFilter(items, effectiveOf);
  const navigate = useNavigate();
  return (
    <div>
      <TagFilterBar {...bar} />
      <ul aria-label="rows">
        {visible.map((item) => (
          <li key={item.id}>{item.id}</li>
        ))}
      </ul>
      <button onClick={() => navigate('/other')}>leave</button>
      <button onClick={() => navigate('/list')}>back</button>
    </div>
  );
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/list']}>
      <Routes>
        <Route path="*" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

const rows = () => screen.getAllByRole('listitem').map((li) => li.textContent);
const chip = (name: string) => screen.getByRole('button', { name });
const user = userEvent.setup();

beforeEach(() => {
  void i18n.changeLanguage('en');
  vi.mocked(useTagsQuery).mockReturnValue({
    data: [
      tag('place', 'Place'),
      tag('office', 'Office', 'place'),
      tag('desk', 'Desk', 'office'),
      tag('home', 'Home', 'place'),
      tag('urgent', 'Urgent'),
    ],
  } as never);
});

describe('TagFilterBar', () => {
  it('第一行：全部、顶层 Tag、无标签', () => {
    renderPage();
    const names = screen.getByRole('toolbar').querySelectorAll('button');
    expect([...names].map((b) => b.textContent)).toEqual(['All', 'Place', 'Urgent', 'No tag']);
    expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
  });

  it('选 Tag 过滤，再点一次取消', async () => {
    renderPage();
    await user.click(chip('Urgent'));
    expect(rows()).toEqual(['a']);
    await user.click(chip('Urgent'));
    expect(rows()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('选父 Tag 命中整棵子树，逐层出现子 Tag 用来收窄；再点退回上一层', async () => {
    renderPage();
    await user.click(chip('Place'));
    expect(rows()).toEqual(['b', 'c', 'e', 'f']);
    await user.click(chip('Office'));
    expect(rows()).toEqual(['b', 'f']);
    await user.click(chip('Desk'));
    expect(rows()).toEqual(['f']);
    await user.click(chip('Desk'));
    expect(rows()).toEqual(['b', 'f']);
    await user.click(chip('Place'));
    expect(rows()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('无标签', async () => {
    renderPage();
    await user.click(chip('No tag'));
    expect(rows()).toEqual(['d']);
  });

  it('离开页面再回来，过滤已重置', async () => {
    renderPage();
    await user.click(chip('Urgent'));
    await user.click(chip('leave'));
    await user.click(chip('back'));
    expect(rows()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

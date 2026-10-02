import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

import { i18n, useTagGroupsQuery, useTagsQuery } from '@taskora/api';
import type { TagResponseDto } from '@taskora/shared';

import { TagFilterBar, useTagFilter } from './TagFilterBar';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTagsQuery: vi.fn(),
  useTagGroupsQuery: vi.fn(),
}));

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, title: string, tagGroupId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', tagGroupId, createdAt: NOW, updatedAt: NOW };
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
    data: [tag('urgent', 'Urgent'), tag('office', 'Office', 'g'), tag('home', 'Home', 'g')],
  } as never);
  vi.mocked(useTagGroupsQuery).mockReturnValue({
    data: [{ id: 'g', title: 'Place', tags: [], createdAt: NOW, updatedAt: NOW }],
  } as never);
});

describe('TagFilterBar', () => {
  it('第一行：全部、Group、未分组 Tag、无标签', () => {
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
    expect(rows()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('选 Group 命中组内任一 Tag，第二行可收窄', async () => {
    renderPage();
    await user.click(chip('Place'));
    expect(rows()).toEqual(['b', 'c']);
    await user.click(chip('Home'));
    expect(rows()).toEqual(['c']);
    await user.click(chip('Home'));
    expect(rows()).toEqual(['b', 'c']);
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
    expect(rows()).toEqual(['a', 'b', 'c', 'd']);
  });
});

import { describe, expect, it } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

import { autoChipOnSpace, removeToken, tagCompletions, tagTokenAt } from './quickFindInput';

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, title: string, parentId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', parentId, createdAt: NOW, updatedAt: NOW };
}

const tags = [
  tag('work', 'Work'),
  tag('meeting', 'Meeting', 'work'),
  tag('urgent', 'Urgent'),
  tag('home-a', 'Home'),
  tag('home-b', 'home', 'work'),
];

describe('tagTokenAt', () => {
  it('光标在词首 `#` 的词里', () => {
    expect(tagTokenAt('#wo', 3)).toEqual({ start: 0, end: 3, query: 'wo' });
    expect(tagTokenAt('report #mee', 11)).toEqual({ start: 7, end: 11, query: 'mee' });
    expect(tagTokenAt('#', 1)).toEqual({ start: 0, end: 1, query: '' });
    // 光标在词中间：整个词是 token，补全词只到光标
    expect(tagTokenAt('#meeting x', 4)).toEqual({ start: 0, end: 8, query: 'mee' });
  });

  it('不在 `#` 词里、或 `#` 不在词首时为 null', () => {
    expect(tagTokenAt('report', 6)).toBeNull();
    expect(tagTokenAt('a#b', 3)).toBeNull();
    expect(tagTokenAt('#work ', 6)).toBeNull();
    expect(tagTokenAt('#work', 0)).toBeNull();
  });
});

describe('removeToken', () => {
  it('去掉 `#` 词并合并多出的空白，返回光标位置', () => {
    expect(removeToken('#wo', { start: 0, end: 3, query: 'wo' })).toEqual({ text: '', caret: 0 });
    expect(removeToken('report #mee later', { start: 7, end: 11, query: 'mee' })).toEqual({
      text: 'report later',
      caret: 7,
    });
    expect(removeToken('#mee later', { start: 0, end: 4, query: 'mee' })).toEqual({
      text: 'later',
      caret: 0,
    });
  });
});

describe('tagCompletions', () => {
  it('空补全词按 Tag 树列出，已是 chip 的不出现', () => {
    expect(tagCompletions(tags, '', ['urgent']).map((c) => [c.tag.id, c.depth])).toEqual([
      ['work', 0],
      ['meeting', 1],
      ['home-b', 1],
      ['home-a', 0],
    ]);
  });

  it('有补全词时扁平结果带父路径', () => {
    expect(tagCompletions(tags, 'me', []).map((c) => [c.tag.id, c.path])).toEqual([
      ['meeting', ['Work']],
      ['home-a', []],
      ['home-b', ['Work']],
    ]);
  });
});

describe('autoChipOnSpace', () => {
  it('`#名字` 唯一对应一个 Tag 时，空格把它转成 chip', () => {
    expect(autoChipOnSpace('report #urgent ', 15, tags)).toEqual({
      tagId: 'urgent',
      text: 'report ',
      caret: 7,
    });
    expect(autoChipOnSpace('#MEETING ', 9, tags)).toEqual({ tagId: 'meeting', text: '', caret: 0 });
  });

  it('同名 Tag 不唯一、没有对应的 Tag、或刚输入的不是空格时不转换', () => {
    expect(autoChipOnSpace('#home ', 6, tags)).toBeNull();
    expect(autoChipOnSpace('#nothing ', 9, tags)).toBeNull();
    expect(autoChipOnSpace('#urgent', 7, tags)).toBeNull();
    expect(autoChipOnSpace('# ', 2, tags)).toBeNull();
  });
});

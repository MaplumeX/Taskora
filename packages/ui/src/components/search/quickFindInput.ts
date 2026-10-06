import type { TagResponseDto } from '@taskora/shared';

import { buildTagPickerRows } from '@/components/task/fields/tagPickerOptions';
import { needleOf } from '../../lib/nameMatch';

/**
 * Quick Find 的 `#tag` 输入（`.scratch/tags-things3-v2` issue 07）：纯函数，
 * 面板只负责把键盘事件接到这里。已确认的 Tag 是输入框前的 chip（存 Tag
 * id），输入框里只剩搜索文字。
 */

/** 光标所在的 `#` 词：text[start] 是 `#`，[start, end) 是整个词。 */
export interface TagToken {
  start: number;
  end: number;
  /** `#` 之后、光标之前的文字。 */
  query: string;
}

const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);

/** 光标处正在输入的 `#` 词（必须在词首）；不在这样的词里时为 null。 */
export function tagTokenAt(text: string, caret: number): TagToken | null {
  let start = caret;
  while (start > 0 && !isSpace(text[start - 1])) start -= 1;
  if (text[start] !== '#' || start === caret) return null;
  let end = caret;
  while (end < text.length && !isSpace(text[end])) end += 1;
  return { start, end, query: text.slice(start + 1, caret) };
}

/** 去掉 `#` 词后的文字与光标位置（去掉词后合并两侧多出的空白）。 */
export function removeToken(text: string, token: TagToken): { text: string; caret: number } {
  const before = text.slice(0, token.start);
  const after = text.slice(token.end);
  const joined = before.endsWith(' ') || before === '' ? after.replace(/^\s+/, '') : after;
  return { text: before + joined, caret: before.length };
}

export interface TagCompletion {
  tag: TagResponseDto;
  depth: number;
  /** 祖先标题，由远到近（同名 Tag 用它区分）。 */
  path: string[];
}

/**
 * 补全候选：`#` 后为空时按 Tag 树列出全部；否则扁平结果，前缀命中在前。
 * 已经是 chip 的 Tag 不再出现。
 */
export function tagCompletions(
  tags: TagResponseDto[],
  query: string,
  chips: readonly string[],
): TagCompletion[] {
  return buildTagPickerRows({ tags, query }).flatMap((row) =>
    row.kind === 'tag' && !chips.includes(row.id)
      ? [{ tag: row.tag, depth: row.depth, path: row.path }]
      : [],
  );
}

/**
 * 空格自动转 chip：刚输入的空格前是 `#名字`，且名字（不区分大小写）正好
 * 对应唯一一个 Tag 时，返回这个 Tag 与去掉 `#名字 ` 之后的文字。
 */
export function autoChipOnSpace(
  text: string,
  caret: number,
  tags: readonly TagResponseDto[],
): { tagId: string; text: string; caret: number } | null {
  if (caret === 0 || text[caret - 1] !== ' ') return null;
  const token = tagTokenAt(text, caret - 1);
  if (!token || token.end !== caret - 1) return null;
  const needle = needleOf(token.query);
  if (!needle) return null;
  const matches = tags.filter((tag) => needleOf(tag.title) === needle);
  if (matches.length !== 1) return null;
  const removed = removeToken(text, { ...token, end: caret });
  return { tagId: matches[0].id, ...removed };
}

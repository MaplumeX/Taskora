import { describe, expect, it } from 'vitest';

import { resolveAction, shortcutLabel, type KeyEventLike } from './keymap';

/** 快捷构造事件（默认无修饰键）。 */
function key(key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  };
}

describe('resolveAction — mac 桌面（Things 原键位）', () => {
  const platform = 'mac' as const;

  it('⌘1..⌘6 依次跳转 Bucket', () => {
    expect(resolveAction(key('1', { metaKey: true }), platform)).toEqual({
      type: 'navigate',
      index: 1,
    });
    expect(resolveAction(key('6', { metaKey: true }), platform)).toEqual({
      type: 'navigate',
      index: 6,
    });
  });

  it('⌘← 返回上一列表；Alt+← 不触发', () => {
    expect(resolveAction(key('ArrowLeft', { metaKey: true }), platform)).toEqual({ type: 'back' });
    expect(resolveAction(key('ArrowLeft', { altKey: true }), platform)).toBeNull();
  });

  it('↑/↓ 移动、Alt+↑/↓ 首末', () => {
    expect(resolveAction(key('ArrowUp'), platform)).toEqual({ type: 'moveUp' });
    expect(resolveAction(key('ArrowDown'), platform)).toEqual({ type: 'moveDown' });
    expect(resolveAction(key('ArrowUp', { altKey: true }), platform)).toEqual({ type: 'moveFirst' });
    expect(resolveAction(key('ArrowDown', { altKey: true }), platform)).toEqual({ type: 'moveLast' });
  });

  it('⌘A 全选、⌘K 完成、⌫/Delete 删除、Enter 展开、Space 下方新建', () => {
    expect(resolveAction(key('a', { metaKey: true }), platform)).toEqual({ type: 'selectAll' });
    expect(resolveAction(key('k', { metaKey: true }), platform)).toEqual({ type: 'complete' });
    expect(resolveAction(key('Backspace'), platform)).toEqual({ type: 'delete' });
    expect(resolveAction(key('Delete'), platform)).toEqual({ type: 'delete' });
    expect(resolveAction(key('Enter'), platform)).toEqual({ type: 'expand' });
    expect(resolveAction(key(' '), platform)).toEqual({ type: 'newTaskBelow' });
  });

  it('⌘N 新任务、⇧⌘N Heading、⌥⌘N 项目', () => {
    expect(resolveAction(key('n', { metaKey: true }), platform)).toEqual({ type: 'newTask' });
    expect(
      resolveAction(key('n', { metaKey: true, shiftKey: true }), platform),
    ).toEqual({ type: 'newHeading' });
    expect(
      resolveAction(key('n', { metaKey: true, altKey: true }), platform),
    ).toEqual({ type: 'newProject' });
  });

  it('⌘F 搜索', () => {
    expect(resolveAction(key('f', { metaKey: true }), platform)).toEqual({ type: 'search' });
  });

  it('⌘Enter 不在全局 registry 派发（行内保存收起）', () => {
    expect(resolveAction(key('Enter', { metaKey: true }), platform)).toBeNull();
  });
});

describe('resolveAction — Windows 桌面（Ctrl 自适应）', () => {
  const platform = 'windows' as const;

  it('Ctrl+1..6 跳转、Alt+← 返回', () => {
    expect(resolveAction(key('3', { ctrlKey: true }), platform)).toEqual({
      type: 'navigate',
      index: 3,
    });
    expect(resolveAction(key('ArrowLeft', { altKey: true }), platform)).toEqual({ type: 'back' });
  });

  it('Ctrl+A/K/N、Ctrl+Shift+N Heading、Ctrl+Alt+N 项目', () => {
    expect(resolveAction(key('a', { ctrlKey: true }), platform)).toEqual({ type: 'selectAll' });
    expect(resolveAction(key('k', { ctrlKey: true }), platform)).toEqual({ type: 'complete' });
    expect(resolveAction(key('n', { ctrlKey: true }), platform)).toEqual({ type: 'newTask' });
    expect(
      resolveAction(key('n', { ctrlKey: true, shiftKey: true }), platform),
    ).toEqual({ type: 'newHeading' });
    expect(
      resolveAction(key('n', { ctrlKey: true, altKey: true }), platform),
    ).toEqual({ type: 'newProject' });
  });

  it('Ctrl+F 搜索、Alt+↑/↓ 首末', () => {
    expect(resolveAction(key('f', { ctrlKey: true }), platform)).toEqual({ type: 'search' });
    expect(resolveAction(key('ArrowUp', { altKey: true }), platform)).toEqual({ type: 'moveFirst' });
  });
});

describe('resolveAction — Web（Alt 系降级）', () => {
  const platform = 'web' as const;

  it('Alt+1..6 跳转；Ctrl+数字不拦截（浏览器保留键）', () => {
    expect(resolveAction(key('2', { altKey: true }), platform)).toEqual({
      type: 'navigate',
      index: 2,
    });
    expect(resolveAction(key('2', { ctrlKey: true }), platform)).toBeNull();
  });

  it('Alt+← 不派发（浏览器后退同效）；Alt+↑/↓ 首末', () => {
    expect(resolveAction(key('ArrowLeft', { altKey: true }), platform)).toBeNull();
    expect(resolveAction(key('ArrowUp', { altKey: true }), platform)).toEqual({ type: 'moveFirst' });
  });

  it('Ctrl+K 完成任务（原为搜索，破坏性改绑）；mac 浏览器 ⌘K 同效', () => {
    expect(resolveAction(key('k', { ctrlKey: true }), platform)).toEqual({ type: 'complete' });
    expect(resolveAction(key('k', { metaKey: true }), platform)).toEqual({ type: 'complete' });
  });

  it('Ctrl+F 搜索', () => {
    expect(resolveAction(key('f', { ctrlKey: true }), platform)).toEqual({ type: 'search' });
  });

  it('Alt+N 新任务、Alt+Shift+N 项目、Alt+H Heading', () => {
    expect(resolveAction(key('n', { altKey: true }), platform)).toEqual({ type: 'newTask' });
    expect(
      resolveAction(key('n', { altKey: true, shiftKey: true }), platform),
    ).toEqual({ type: 'newProject' });
    expect(resolveAction(key('h', { altKey: true }), platform)).toEqual({ type: 'newHeading' });
  });
});

describe('resolveAction — 通用', () => {
  it.each(['mac', 'windows', 'web'] as const)('%s: 无修饰字母键不触发动作', (platform) => {
    expect(resolveAction(key('n'), platform)).toBeNull();
    expect(resolveAction(key('k'), platform)).toBeNull();
    expect(resolveAction(key('a'), platform)).toBeNull();
    expect(resolveAction(key('h'), platform)).toBeNull();
    expect(resolveAction(key('f'), platform)).toBeNull();
  });

  it.each(['mac', 'windows', 'web'] as const)('%s: 带修饰的 ↑/↓ 不误触移动', (platform) => {
    expect(resolveAction(key('ArrowUp', { shiftKey: true }), platform)).toBeNull();
    expect(resolveAction(key('ArrowDown', { ctrlKey: true }), platform)).toBeNull();
    expect(resolveAction(key('ArrowDown', { metaKey: true }), platform)).toBeNull();
  });

  it.each(['mac', 'windows', 'web'] as const)('%s: 普通字符输入不触发动作', (platform) => {
    expect(resolveAction(key('x'), platform)).toBeNull();
    expect(resolveAction(key('7'), platform)).toBeNull();
  });

  it.each(['mac', 'windows', 'web'] as const)('%s: Shift+Enter 不展开（保留扩展语义）', (platform) => {
    expect(resolveAction(key('Enter', { shiftKey: true }), platform)).toBeNull();
  });
});

// shortcutLabel 的期望值以 docs/keyboard-shortcuts.md 的 P0 键位表为
// 独立真值来源（⌘N / Ctrl+N / Alt+N 三平台矩阵）。
describe('shortcutLabel — 按钮 hint 键位文案', () => {
  it.each([
    ['search', { mac: '⌘F', windows: 'Ctrl+F', web: 'Ctrl+F' }],
    ['newTask', { mac: '⌘N', windows: 'Ctrl+N', web: 'Alt+N' }],
    ['newProject', { mac: '⌥⌘N', windows: 'Ctrl+Alt+N', web: 'Alt+Shift+N' }],
    ['newHeading', { mac: '⇧⌘N', windows: 'Ctrl+Shift+N', web: 'Alt+H' }],
  ] as const)('%s 三平台文案与键位表一致', (action, labels) => {
    expect(shortcutLabel(action, 'mac')).toBe(labels.mac);
    expect(shortcutLabel(action, 'windows')).toBe(labels.windows);
    expect(shortcutLabel(action, 'web')).toBe(labels.web);
  });

  it('与 resolveAction 的解析键位一一对应（抽查 mac 搜索 / web 新任务）', () => {
    expect(resolveAction(key('f', { metaKey: true }), 'mac')?.type).toBe('search');
    expect(resolveAction(key('n', { altKey: true }), 'web')?.type).toBe('newTask');
  });
});

import { describe, expect, it } from 'vitest';

import {
  quickAddShortcutLabel,
  resolveAction,
  resolveQuickAddAction,
  shortcutLabel,
  type KeyEventLike,
} from './keymap';

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
    expect(resolveAction(key('ArrowUp', { altKey: true }), platform)).toEqual({
      type: 'moveFirst',
    });
    expect(resolveAction(key('ArrowDown', { altKey: true }), platform)).toEqual({
      type: 'moveLast',
    });
  });

  it('裸 ←/→ 不派发动作（分组不可折叠）；带修饰同样不触发', () => {
    expect(resolveAction(key('ArrowLeft'), platform)).toBeNull();
    expect(resolveAction(key('ArrowRight'), platform)).toBeNull();
    expect(resolveAction(key('ArrowRight', { altKey: true }), platform)).toBeNull();
    expect(resolveAction(key('ArrowRight', { metaKey: true }), platform)).toBeNull();
    expect(resolveAction(key('ArrowLeft', { shiftKey: true }), platform)).toBeNull();
  });

  it('⌘A 全选、⌘K 完成、⌫/Delete 删除、Enter 展开、Space 下方新建', () => {
    expect(resolveAction(key('a', { metaKey: true }), platform)).toEqual({ type: 'selectAll' });
    expect(resolveAction(key('k', { metaKey: true }), platform)).toEqual({ type: 'complete' });
    expect(resolveAction(key('Backspace'), platform)).toEqual({ type: 'delete' });
    expect(resolveAction(key('Delete'), platform)).toEqual({ type: 'delete' });
    expect(resolveAction(key('Enter'), platform)).toEqual({ type: 'expand' });
    expect(resolveAction(key(' '), platform)).toEqual({ type: 'newTaskBelow' });
  });

  it('⌥⌘K 取消；与 ⌘K 完成不冲突', () => {
    expect(resolveAction(key('k', { metaKey: true, altKey: true }), platform)).toEqual({
      type: 'cancel',
    });
    // ⇧⌥⌘K 不触发（避免与其它修饰组合误触）
    expect(
      resolveAction(key('k', { metaKey: true, altKey: true, shiftKey: true }), platform),
    ).toBeNull();
  });

  it('⌘N 新任务、⇧⌘N Heading、⌥⌘N 项目', () => {
    expect(resolveAction(key('n', { metaKey: true }), platform)).toEqual({ type: 'newTask' });
    expect(resolveAction(key('n', { metaKey: true, shiftKey: true }), platform)).toEqual({
      type: 'newHeading',
    });
    expect(resolveAction(key('n', { metaKey: true, altKey: true }), platform)).toEqual({
      type: 'newProject',
    });
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
    expect(resolveAction(key('n', { ctrlKey: true, shiftKey: true }), platform)).toEqual({
      type: 'newHeading',
    });
    expect(resolveAction(key('n', { ctrlKey: true, altKey: true }), platform)).toEqual({
      type: 'newProject',
    });
  });

  it('Ctrl+F 搜索、Alt+↑/↓ 首末', () => {
    expect(resolveAction(key('f', { ctrlKey: true }), platform)).toEqual({ type: 'search' });
    expect(resolveAction(key('ArrowUp', { altKey: true }), platform)).toEqual({
      type: 'moveFirst',
    });
  });

  it('Ctrl+Alt+K 取消；与 Ctrl+K 完成不冲突', () => {
    expect(resolveAction(key('k', { ctrlKey: true, altKey: true }), platform)).toEqual({
      type: 'cancel',
    });
    expect(
      resolveAction(key('k', { ctrlKey: true, altKey: true, shiftKey: true }), platform),
    ).toBeNull();
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
    expect(resolveAction(key('ArrowUp', { altKey: true }), platform)).toEqual({
      type: 'moveFirst',
    });
  });

  it('Ctrl+K 完成任务（原为搜索，破坏性改绑）；mac 浏览器 ⌘K 同效', () => {
    expect(resolveAction(key('k', { ctrlKey: true }), platform)).toEqual({ type: 'complete' });
    expect(resolveAction(key('k', { metaKey: true }), platform)).toEqual({ type: 'complete' });
  });

  it('Alt+Shift+K 取消（Ctrl+Alt 被浏览器占用时的降级键位）', () => {
    expect(resolveAction(key('k', { altKey: true, shiftKey: true }), platform)).toEqual({
      type: 'cancel',
    });
  });

  it('Ctrl+F 搜索', () => {
    expect(resolveAction(key('f', { ctrlKey: true }), platform)).toEqual({ type: 'search' });
  });

  it('Alt+N 新任务、Alt+Shift+N 项目、Alt+H Heading', () => {
    expect(resolveAction(key('n', { altKey: true }), platform)).toEqual({ type: 'newTask' });
    expect(resolveAction(key('n', { altKey: true, shiftKey: true }), platform)).toEqual({
      type: 'newProject',
    });
    expect(resolveAction(key('h', { altKey: true }), platform)).toEqual({ type: 'newHeading' });
  });
});

describe('resolveAction — 通用', () => {
  it.each(['mac', 'windows', 'web'] as const)(
    '%s: 无修饰字母键只唤起 Quick Find，不触发其他动作',
    (platform) => {
      for (const letter of ['n', 'k', 'a', 'h', 'f']) {
        expect(resolveAction(key(letter), platform)).toEqual({ type: 'typeToFind', seed: letter });
      }
    },
  );

  it.each(['mac', 'windows', 'web'] as const)('%s: 带修饰的 ↑/↓ 不误触移动', (platform) => {
    expect(resolveAction(key('ArrowUp', { shiftKey: true }), platform)).toBeNull();
    expect(resolveAction(key('ArrowDown', { ctrlKey: true }), platform)).toBeNull();
    expect(resolveAction(key('ArrowDown', { metaKey: true }), platform)).toBeNull();
  });

  it.each(['mac', 'windows', 'web'] as const)(
    '%s: 普通字符（含 Shift、数字、符号）唤起 Quick Find 并带入该字符',
    (platform) => {
      expect(resolveAction(key('x'), platform)).toEqual({ type: 'typeToFind', seed: 'x' });
      expect(resolveAction(key('X', { shiftKey: true }), platform)).toEqual({
        type: 'typeToFind',
        seed: 'X',
      });
      // 无修饰的 1..6 不是导航键
      expect(resolveAction(key('1'), platform)).toEqual({ type: 'typeToFind', seed: '1' });
      expect(resolveAction(key('7'), platform)).toEqual({ type: 'typeToFind', seed: '7' });
      expect(resolveAction(key('#', { shiftKey: true }), platform)).toEqual({
        type: 'typeToFind',
        seed: '#',
      });
      expect(resolveAction(key('中'), platform)).toEqual({ type: 'typeToFind', seed: '中' });
    },
  );

  it.each(['mac', 'windows', 'web'] as const)(
    '%s: 输入法组合的首键只唤起，不带入字符',
    (platform) => {
      const ime = { type: 'typeToFind', seed: '' };
      expect(resolveAction(key('Process'), platform)).toEqual(ime);
      expect(resolveAction(key('a', { keyCode: 229 }), platform)).toEqual(ime);
      expect(resolveAction(key('a', { isComposing: true }), platform)).toEqual(ime);
    },
  );

  it.each(['mac', 'windows', 'web'] as const)(
    '%s: 空格、带 ⌘/Ctrl/Alt 的字符、非字符键不唤起 Quick Find',
    (platform) => {
      expect(resolveAction(key(' '), platform)).toEqual({ type: 'newTaskBelow' });
      expect(resolveAction(key('x', { ctrlKey: true }), platform)).toBeNull();
      expect(resolveAction(key('x', { metaKey: true }), platform)).toBeNull();
      expect(resolveAction(key('x', { altKey: true }), platform)).toBeNull();
      expect(resolveAction(key('7', { ctrlKey: true }), platform)).toBeNull();
      for (const name of ['Tab', 'Escape', 'F1', 'Shift', 'Dead', 'ArrowLeft']) {
        expect(resolveAction(key(name), platform)).toBeNull();
      }
    },
  );

  it.each(['mac', 'windows', 'web'] as const)(
    '%s: Shift+Enter 不展开（保留扩展语义）',
    (platform) => {
      expect(resolveAction(key('Enter', { shiftKey: true }), platform)).toBeNull();
    },
  );
});

// shortcutLabel 的期望值以 docs/keyboard-shortcuts.md 的 P0 键位表为
// 独立真值来源（⌘N / Ctrl+N / Alt+N 三平台矩阵）。
describe('resolveAction — 标签（tags-things3 issue 04）', () => {
  it('mac ⇧⌘T；⌘T 不触发', () => {
    expect(resolveAction(key('T', { metaKey: true, shiftKey: true }), 'mac')).toEqual({
      type: 'tags',
    });
    expect(resolveAction(key('t', { metaKey: true }), 'mac')).toBeNull();
  });

  it('Windows 桌面 Ctrl+Shift+T', () => {
    expect(resolveAction(key('T', { ctrlKey: true, shiftKey: true }), 'windows')).toEqual({
      type: 'tags',
    });
  });

  it('Web Alt+Shift+T；Ctrl+Shift+T 让给浏览器', () => {
    expect(resolveAction(key('T', { altKey: true, shiftKey: true }), 'web')).toEqual({
      type: 'tags',
    });
    expect(resolveAction(key('T', { ctrlKey: true, shiftKey: true }), 'web')).toBeNull();
  });
});

describe('resolveAction — 助手面板（assistant-panel issue 03）', () => {
  const toggle = { type: 'toggleAssistantPanel' };

  it('mac ⌘J；带 ⇧/⌥ 不触发', () => {
    expect(resolveAction(key('j', { metaKey: true }), 'mac')).toEqual(toggle);
    expect(resolveAction(key('J', { metaKey: true, shiftKey: true }), 'mac')).toBeNull();
    expect(resolveAction(key('j', { metaKey: true, altKey: true }), 'mac')).toBeNull();
  });

  it('Windows 桌面 Ctrl+J', () => {
    expect(resolveAction(key('j', { ctrlKey: true }), 'windows')).toEqual(toggle);
  });

  it('Web Alt+J；Ctrl+J 让给浏览器（下载页）', () => {
    expect(resolveAction(key('j', { altKey: true }), 'web')).toEqual(toggle);
    expect(resolveAction(key('j', { ctrlKey: true }), 'web')).toBeNull();
  });

  it('裸 j 仍是打字唤起', () => {
    expect(resolveAction(key('j'), 'mac')).toEqual({ type: 'typeToFind', seed: 'j' });
  });
});

describe('shortcutLabel — 按钮 hint 键位文案', () => {
  it.each([
    ['search', { mac: '⌘F', windows: 'Ctrl+F', web: 'Ctrl+F' }],
    ['newTask', { mac: '⌘N', windows: 'Ctrl+N', web: 'Alt+N' }],
    ['newProject', { mac: '⌥⌘N', windows: 'Ctrl+Alt+N', web: 'Alt+Shift+N' }],
    ['newHeading', { mac: '⇧⌘N', windows: 'Ctrl+Shift+N', web: 'Alt+H' }],
    ['tags', { mac: '⇧⌘T', windows: 'Ctrl+Shift+T', web: 'Alt+Shift+T' }],
    ['toggleAssistantPanel', { mac: '⌘J', windows: 'Ctrl+J', web: 'Alt+J' }],
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

describe('resolveQuickAddAction — Quick Add 卡片', () => {
  it('mac：⌘ 系字段键与提交键', () => {
    const mac = 'mac' as const;
    expect(resolveQuickAddAction(key('s', { metaKey: true }), mac)).toBe('when');
    expect(resolveQuickAddAction(key('t', { metaKey: true }), mac)).toBe('today');
    expect(resolveQuickAddAction(key('o', { metaKey: true }), mac)).toBe('someday');
    expect(resolveQuickAddAction(key('D', { metaKey: true, shiftKey: true }), mac)).toBe(
      'deadline',
    );
    expect(resolveQuickAddAction(key('T', { metaKey: true, shiftKey: true }), mac)).toBe('tags');
    expect(resolveQuickAddAction(key('M', { metaKey: true, shiftKey: true }), mac)).toBe('move');
    expect(resolveQuickAddAction(key('Enter', { metaKey: true }), mac)).toBe('submit');
    expect(resolveQuickAddAction(key('Enter', { metaKey: true, shiftKey: true }), mac)).toBe(
      'submitAndContinue',
    );
  });

  it('mac 上 Ctrl 不算主修饰键；Windows 用 Ctrl', () => {
    expect(resolveQuickAddAction(key('s', { ctrlKey: true }), 'mac')).toBeNull();
    expect(resolveQuickAddAction(key('s', { ctrlKey: true }), 'windows')).toBe('when');
    expect(resolveQuickAddAction(key('T', { ctrlKey: true, shiftKey: true }), 'windows')).toBe(
      'tags',
    );
  });

  it('无修饰、带 Alt、输入法组字中均不解析', () => {
    expect(resolveQuickAddAction(key('s'), 'mac')).toBeNull();
    expect(resolveQuickAddAction(key('s', { metaKey: true, altKey: true }), 'mac')).toBeNull();
    expect(
      resolveQuickAddAction(key('Enter', { metaKey: true, isComposing: true }), 'mac'),
    ).toBeNull();
  });

  it('键位文案按平台', () => {
    expect(quickAddShortcutLabel('move', 'mac')).toBe('⇧⌘M');
    expect(quickAddShortcutLabel('move', 'windows')).toBe('Ctrl+Shift+M');
  });
});

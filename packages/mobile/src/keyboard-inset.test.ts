import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  computeKeyboardInset,
  installKeyboardInset,
  isKeyboardTarget,
  KEYBOARD_SETTLE_MS,
} from './keyboard-inset';

describe('computeKeyboardInset（issue 05 键盘避让）', () => {
  it('键盘弹出：layout 高度减去 visualViewport 可见高度', () => {
    // 800px 屏幕，键盘占 280px
    expect(computeKeyboardInset(800, { height: 520, offsetTop: 0 })).toBe(280);
  });

  it('visualViewport 向上滚动（内容上移补偿）时扣除 offsetTop', () => {
    expect(computeKeyboardInset(800, { height: 520, offsetTop: 40 })).toBe(240);
  });

  it('键盘收起（adjustResize 场景公式自然归零）', () => {
    expect(computeKeyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
  });

  it('负值钳制为 0（不做反向拉伸）', () => {
    expect(computeKeyboardInset(600, { height: 700, offsetTop: 0 })).toBe(0);
  });

  it('亚像素高度取整，避免布局抖动', () => {
    expect(computeKeyboardInset(800, { height: 519.6, offsetTop: 0 })).toBe(280);
  });
});

describe('installKeyboardInset（issue 05 键盘避让）', () => {
  const listeners = new Map<string, () => void>();
  const fakeViewport = {
    height: 520,
    offsetTop: 0,
    addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
    removeEventListener: (event: string) => listeners.delete(event),
  };
  const inset = () => document.documentElement.style.getPropertyValue('--kb-inset');

  beforeEach(() => {
    vi.useFakeTimers();
    listeners.clear();
    fakeViewport.height = 520;
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: fakeViewport });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--kb-inset');
  });

  it('初始即写入，清理时移除并解绑', () => {
    const cleanup = installKeyboardInset();
    expect(inset()).toBe('280px');

    cleanup();
    expect(inset()).toBe('');
    expect(listeners.size).toBe(0);
  });

  it('键盘动画期间不逐帧写入，视口稳定后只写一次', () => {
    const cleanup = installKeyboardInset();

    // 键盘收起：连续多帧 resize
    for (const height of [600, 700, 780, 800]) {
      fakeViewport.height = height;
      listeners.get('resize')!();
      vi.advanceTimersByTime(16);
      expect(inset()).toBe('280px');
    }
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS);
    expect(inset()).toBe('0px');

    // scroll 事件同路径
    fakeViewport.height = 520;
    listeners.get('scroll')!();
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS);
    expect(inset()).toBe('280px');

    cleanup();
  });

  it('焦点离开输入框且未落到另一个输入框：立即归零', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    document.body.append(input, button);
    const cleanup = installKeyboardInset();

    input.focus();
    button.focus();
    expect(inset()).toBe('0px');

    cleanup();
  });

  it('焦点在输入框之间移动：键盘保持，不归零', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    document.body.append(input, textarea);
    const cleanup = installKeyboardInset();

    input.focus();
    textarea.focus();
    expect(inset()).toBe('280px');

    cleanup();
  });

  it('窗口失焦引起的 focusout 不归零', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const cleanup = installKeyboardInset();

    input.focus();
    vi.mocked(document.hasFocus).mockReturnValue(false);
    input.blur();
    expect(inset()).toBe('280px');

    cleanup();
  });

  it('无 visualViewport 的环境为 no-op', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
    const cleanup = installKeyboardInset();
    expect(inset()).toBe('');
    expect(() => cleanup()).not.toThrow();
  });
});

describe('isKeyboardTarget', () => {
  it('文本输入框、textarea、contenteditable 会唤起键盘', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isKeyboardTarget(document.createElement('input'))).toBe(true);
    expect(isKeyboardTarget(document.createElement('textarea'))).toBe(true);
    // jsdom 未实现 isContentEditable
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isKeyboardTarget(editable)).toBe(true);
  });

  it('按钮、复选框与非元素不唤起键盘', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    expect(isKeyboardTarget(checkbox)).toBe(false);
    expect(isKeyboardTarget(document.createElement('button'))).toBe(false);
    expect(isKeyboardTarget(null)).toBe(false);
  });
});

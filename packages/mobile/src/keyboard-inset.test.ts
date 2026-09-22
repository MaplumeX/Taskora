import { afterEach, describe, expect, it } from 'vitest';

import { computeKeyboardInset, installKeyboardInset } from './keyboard-inset';

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
  afterEach(() => {
    document.documentElement.style.removeProperty('--kb-inset');
  });

  it('把计算结果写入 --kb-inset，并在清理时移除', () => {
    const listeners = new Map<string, () => void>();
    const fakeViewport = {
      height: 520,
      offsetTop: 0,
      addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
      removeEventListener: (event: string) => listeners.delete(event),
    };
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: fakeViewport,
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });

    const cleanup = installKeyboardInset();

    // 初始即写入
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('280px');

    // 键盘收起事件
    fakeViewport.height = 800;
    listeners.get('resize')!();
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('0px');

    // scroll 事件同路径
    fakeViewport.height = 520;
    listeners.get('scroll')!();
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('280px');

    cleanup();
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('');
    expect(listeners.size).toBe(0);
  });

  it('无 visualViewport 的环境为 no-op', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
    const cleanup = installKeyboardInset();
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('');
    expect(() => cleanup()).not.toThrow();
  });
});

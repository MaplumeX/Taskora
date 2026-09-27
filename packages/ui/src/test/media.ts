/**
 * 测试用：控制 matchMedia('(min-width: 768px)') 的返回值，驱动 useIsDesktop。
 * 返回还原函数（jsdom 默认 polyfill 恒为 false，即窄屏）。
 */
export function mockDesktop(desktop: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = (query: string) =>
    ({
      matches: desktop && query.includes('min-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  return () => {
    window.matchMedia = original;
  };
}

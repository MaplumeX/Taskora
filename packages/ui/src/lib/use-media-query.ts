import { useEffect, useState } from 'react';

/**
 * 跟踪一个 CSS media query 的匹配状态（SSR/测试环境默认 false）。
 *
 * 用于「移动端与桌面端需要两套结构、无法靠 CSS 断点显隐同一棵树」的场景。
 * 与 Tailwind 断点保持同一阈值字符串，避免两处漂移。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** 与 Tailwind `md` 断点一致：>=768px 视为桌面。 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

import '@testing-library/jest-dom/vitest';
import '@/i18n/config';

// jsdom does not implement matchMedia — polyfill it so stores that access
// prefers-color-scheme at module load time don't crash.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

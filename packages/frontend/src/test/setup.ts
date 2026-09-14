import '@testing-library/jest-dom/vitest';

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

// Initializes the shared i18n instance.
import '@taskora/api';

// jsdom does not implement matchMedia — polyfill it so stores that access
// prefers-color-scheme at module load time don't crash. Separate file so the
// polyfill runs before any @taskora/api import (ESM imports hoist).
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

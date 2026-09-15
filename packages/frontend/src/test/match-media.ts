// jsdom does not implement matchMedia — polyfill it so stores that access
// prefers-color-scheme at module load time don't crash.
// Kept as its own module: ESM imports are hoisted, so setup.ts importing
// `@taskora/api` below would otherwise run before this polyfill.
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

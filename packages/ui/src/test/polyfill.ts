// jsdom does not implement matchMedia — polyfill it so stores that access
// prefers-color-scheme at module load time don't crash. Loaded as a separate
// setup file BEFORE anything imports @taskora/api (ESM imports hoist, so the
// polyfill must live in its own earlier-executing module).
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

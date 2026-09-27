/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- CJS tailwind config */
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@taskora/ui/tailwind.preset').default],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../ui/src/**/*.{ts,tsx}'],
};

# Android Quick Add renders the shared web card

The Android status-bar quick add (`QuickAddActivity`) first drew its own native
card: Kotlin views, its own date chips and pickers, and a flattened data
snapshot with every label pre-translated by JS. It opened instantly, but it
was a second implementation of the Quick Add card. Its look and behaviour
drifted from the desktop card and the expanded task, and every field the
desktop card gained had to be rebuilt by hand.

## Decision

- The overlay stays a transparent native Activity in its own task. Native code
  draws only the scrim and the enter/exit animations. The card is a transparent
  `WebView` that runs the same `QuickAddCard` (packages/ui) as the desktop
  quick-add window and the expanded task: same fields, same pickers (narrow
  screens use the centred field dialogs), same draft mapping.
- The page (`packages/mobile/src/quick-add`) is built separately by
  `vite.quick-add.config.ts` into the statusbar plugin's Android assets and
  loaded through `WebViewAssetLoader`. The main Tauri WebView's bundled assets
  are not reachable from a plain `WebView`. The quick-add page skips the
  Noto Sans SC web font: the Android system CJK font is Noto Sans CJK, so the
  card looks the same, and the APK does not carry a second ~4MB copy.
- Data follows the desktop quick-add window: no Engine on the page. The main
  WebView pushes a v2 snapshot (full project / area / tag DTOs plus account
  time zone, week start, language and theme) into SharedPreferences. The page
  writes it into the React Query cache under the same keys, so the field
  pickers work without changes. A stale snapshot is safe because
  `createFromQuickAddDraft` validates references when the task is created.
- Submission is unchanged: the page hands `QuickAddDraft` JSON to the native
  host bridge, which queues it via `StatusBarPlugin.submitQuickAdd`. The main
  WebView creates the task, including from a cold start.
- Touch has no keyboard shortcuts, so `QuickAddCard` takes a `footer` render
  prop that replaces the desktop hint row with buttons: continue in app, keep
  adding, add.

## Consequences

- Opening the overlay now waits for WebView start-up and the page bundle before
  the card and keyboard appear (the scrim shows right away). This is slower
  than the native card. We accept that in exchange for a single card
  implementation.
- `pnpm build:vite` (and so `tauri android build`) and `pnpm dev` build the
  quick-add page first. If the assets are missing, the overlay shows only the
  scrim.

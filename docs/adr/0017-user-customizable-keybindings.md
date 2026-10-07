# User-customizable keybindings

ADR 0004 shipped every shortcut hard-coded, and `docs/keyboard-shortcuts.md`
said keybindings would not be user-configurable. Users now want to see all
shortcuts in Settings and rebind them. ADR 0004 already anticipated this
("自定义键位……都在此扩展"), so the single-dispatch registry stays; only the
source of the key → action table changes.

## Decision

- `keymap.ts` holds a declarative registry (`SHORTCUTS`): one entry per action
  with per-platform default chords. `resolveAction` normalizes the event to a
  chord string (`Ctrl+Alt+Shift+Meta+Key`) and looks it up in defaults merged
  with user overrides. Hint labels (`shortcutLabel`) read the same table, so a
  rebind also updates button tooltips.
- With Alt or Shift held, letters and digits are taken from `KeyboardEvent.code`
  (macOS ⌥N reports `key` as a dead key). Bare printable keys that are not bound
  still fall through to type-to-find.
- Overrides live in `useKeybindingsStore` (`taskora-keybindings` in
  localStorage). They store only the actions the user changed, and an empty list
  means the action is unbound. They are **per device and not synced**: chords
  contain physical modifiers (⌘ on macOS, Ctrl on Windows), so a binding
  recorded on one platform is meaningless on another.
- Settings → Shortcuts lists every action. Clicking a binding records the next
  chord (Esc cancels). If another action already uses that chord, the chord is
  moved to the new action and the toast names the action that lost it.
- Quick Add card keys live in the same registry under a separate `quickAdd`
  scope. Conflicts are checked only within a scope, so ⇧⌘T can mean "tags" in
  both the main window and the card. The card is a separate long-lived webview,
  so the store rehydrates on `storage` events and every time the window opens.
- The system-wide Quick Add hotkey is the exception: Rust keeps it, because it
  has to be registered at startup before any webview loads. It is stored as a
  Tauri accelerator in `quick-add-shortcut.json` under the app data dir
  (`quick_add_shortcut.rs`). Rebinding registers the new hotkey before it
  unregisters the old one, so if another app already holds the new hotkey, the
  old one keeps working. It must include Ctrl, Alt or ⌘. The OS takes the
  hotkey before the app sees it, so recording it removes the same chord from
  in-app actions, and an in-app action cannot be set to it.
- Not rebindable: the in-editor ⌘Enter, plain Enter / Esc in the Quick Add
  card, and type-to-find. Settings lists them as fixed shortcuts.

## Consequences

- The web defaults still fall back to the Alt family. Browser-reserved chords
  (Ctrl+N/T/W, Ctrl+digits) never reach the page, so they cannot be recorded.
- Binding a bare letter takes that letter away from type-to-find.

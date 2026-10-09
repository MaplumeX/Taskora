# Desktop main window draws its own unified chrome

The desktop main window has switched window chrome twice. #35 added a custom
title bar: a separate strip with a title and window buttons. #44 dropped it and
went back to native decorations, and no reason was recorded. With the native
title bar, every platform puts its own grey strip above a layout designed to
fill the window, and the sidebar colour stops short of the top edge.

## Decision

- The main window uses a unified chrome, like Things and Linear: there is no
  title bar strip. The sidebar, the main column and the assistant panel each
  paint their own background up to the window's top edge. A transparent drag
  strip (`WindowChrome`, packages/desktop) sits over the top of the window.
- macOS keeps the native traffic lights (`titleBarStyle: Overlay` +
  `hiddenTitle`), floating over the sidebar. Windows and Linux turn native
  decorations off in the Rust setup hook. The frontend draws minimize,
  maximize/restore and close. Tauri's undecorated resizing keeps edge resize
  working. The main window starts hidden and is shown after decorations are
  set, so the native frame never flashes.
- The strip height is the single CSS variable `--titlebar-h` (28px on macOS,
  32px elsewhere). The desktop shell sets it, and on web and Android it is
  unset, so it counts as 0. At `md` and wider the shared layout pads the main
  column and the assistant panel by it. The sidebar only clears the traffic
  lights (`--sidebar-inset-top`: 16px on macOS, 0 elsewhere). On Windows and
  Linux, the sidebar's account button sits on top of the drag strip, at the
  same position as on the web.
- Below `md` (the phone layout in a narrow window), `--titlebar-h` is folded
  into `--safe-area-top` through `--native-safe-top`, so the top bar, drawer
  and full-screen dialogs clear it exactly as they clear an Android status
  bar. In fullscreen the strip goes away and both variables drop to 0.
- The drag strip sits at z-40, below menus and modal overlays (z-50), with the
  sidebar account button just above it (z-41). The window buttons sit above
  modal overlays (z-60), swallow `pointerdown` and never take focus. While a
  dialog is open, the window can be minimized or closed but not dragged, and
  using the buttons does not dismiss the dialog.

## Consequences

- Windows 11 Snap Layouts no longer appear when hovering the maximize button.
  Win+Arrow and dragging to a screen edge still snap.
- Anything the shared layout places at the very top of a column must respect
  `--titlebar-h`, or it ends up under the drag strip and the window buttons.
- Restoring a maximized window state on Windows can briefly show the native
  frame. The window-state plugin maximizes, and so shows, the window before
  the setup hook removes decorations.

---
status: accepted
---

# Desktop secondary windows proxy the main window's Engine

Things-style multiple windows (`.scratch/multi-window`) give the desktop app
more than one webview showing the full UI. Each Tauri window is its own JS
context, but the Local Replica must have one Outbox, one HLC and one sync loop
(ADR-0007). The quick-add relay already avoids a second Engine by sending its
reads and writes to the main window.

## Decision

- The main window stays the only Engine owner. It never goes away while the
  app runs (close hides it to the tray), so it is a permanent leader: no
  election and no hand-over.
- A secondary window reads and writes through `TabEngine`, the proxy the web
  client uses for non-leader tabs (local-first-v3 issue 05). It moves from
  `frontend` to `@taskora/api` so both hosts share it. The desktop channel is
  a single Tauri event; each message carries its sender's window label so a
  window ignores its own messages, the same as `BroadcastChannel`.
- The main window serves calls with `createEngineHost`, forwards Engine
  changes so live queries re-run in every window, and broadcasts sync status.
  `sync` from a secondary window goes through the main window's scheduler.
  When the main Engine fails to start or needs an upgrade, it broadcasts
  `unavailable`, and secondary windows fall back to REST.
- Reminders, the quick-add relay, tray labels and blob upload resumption stay
  main-window only. Secondary windows connect their own Event Stream for the
  REST-backed data (calendar events, assistant); `onRemoteChangeEvent` has no
  subscriber there, so it never triggers a second pull.

## Considered Options

- **One Engine per window on the shared SQLite file.** Rejected: two HLCs for
  one device id, two Outboxes racing to flush, and change notifications that
  would still need a cross-window channel. That means reinventing locking in the
  storage layer, the reason the quick-add relay exists.
- **A bespoke RPC per feature, like the quick-add snapshot.** Rejected: a
  secondary window runs every page, so it needs the whole Engine surface.
  `TabEngine` already proxies exactly that, with tests.

## Consequences

- Every read in a secondary window is an IPC round trip to the main window.
  Live queries keep this to the queries a change actually affects.
- If the main window's JS is stuck (e.g. a long bootstrap), secondary windows
  wait with it. Calls made before the main Engine is ready queue until its
  `hello`.

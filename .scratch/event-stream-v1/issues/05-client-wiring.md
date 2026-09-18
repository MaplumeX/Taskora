# 05 — Client wiring: connection manager + focus-refetch off

Status: done

## Summary

- `src/events/event-stream-client.ts` — app-layer singleton
  (`initEventStream(queryClient)`): watches the auth store, connects after
  login, disconnects on logout; fetch + ReadableStream SSE parsing (same
  pattern as `agent-sse.ts`); reconnect with backoff; `?since=<lastSeq>` on
  reconnect; client-side gap detection and `resync` frames trigger one full
  `invalidateQueries()`; 401 → `refreshSession()` then retry.
- Wired in `packages/frontend/src/main.tsx`, `packages/desktop/src/main.tsx`
  (main window) and `packages/desktop/src/quickAddBoot.ts` (Quick Add gets its
  own QueryClient + connection per spec).
- `refetchOnWindowFocus: false` in both packages; `staleTime` unchanged.

## Acceptance

- `pnpm typecheck` and `pnpm test` green across packages.
- No component lifecycle owns the connection (app entry only).

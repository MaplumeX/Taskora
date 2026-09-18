# 03 — Backend: /events SSE endpoint

Status: done

## Summary

- `GET /events` (SSE, `?since=<lastSeq>` optional): JWT-guarded like the agent
  SSE endpoint (fetch + Bearer header on the client side).
- On connect the server writes a `hello` frame with the user's current seq;
  when `since` is supplied it replays buffered events with `seq > since`, or
  writes a `resync` frame when the gap exceeds the ring buffer (or the seq
  jumped backwards after a restart).
- Heartbeat comment every 25s keeps proxies from closing idle streams.

## Acceptance

- Hub replay/resync edge cases unit-tested (`test/change-event-hub.spec.ts`).
- `test/events.controller.e2e-spec.ts`: auth rejection, hello frame, live
  change events after API writes, reconnect replay via `?since=`.

# 06 — Collector flush must not race open transactions

Status: done

## Summary

CI on `main` began failing intermittently in
`test/change-events.service.spec.ts` right after #119 merged:

```
Change Events (service-level integration)
> emits created with the list-DTO payload shape (embedded tags, no subtasks)
AssertionError: expected [] to have a length of 1 but got +0
```

The PR's own CI run passed; the same commit failed on the `main` push
(run 36715980472, job `build-test` → `pnpm test`). The later v0.7.0 push was
green again, so it is a race, not a deterministic break from #119.

## Root cause

`ChangeEventCollector.record()` queues every write descriptor immediately,
including descriptors recorded inside an open `$transaction` — only the
*scheduling* of a flush is skipped while `txDepth > 0`. `runFlush()` then
drained `pending` without re-checking the depth, so a pass already in flight
when a new transaction started would `splice()` that transaction's
descriptors and try to publish them.

`publishDescriptor()` refetches the row through the **base** (unextended)
client, which cannot see uncommitted rows. It found no payload and silently
dropped the event:

```
[ce-debug] runFlush batch [ 'tag:1fbe827f…:created' ]
[ce-debug] dropped (no payload) tag:1fbe827f…
```

The transaction committed afterwards, but its descriptor had already been
consumed, so no `created` event ever reached the hub. This is not test-only:
in production a dropped event drifts every client cache until the next
reconnect/resync backstop.

The race needs a pending flush timer (from an earlier committed write) to
fire between `record()` of the next write and that write's commit. It is
timing sensitive, hence flaky — CI's 2 vCPU runner hits it far more often
than a developer machine, and only while the whole suite competes for CPU.

## Fix

- `runFlush()` consumes `pending` only while `txDepth === 0`. An open
  transaction leaves its descriptors queued; the transaction's `finally`
  lowers the depth and schedules the next pass.
- `flush()` (test-only deterministic drain) returns early when a transaction
  is open instead of spinning on descriptors it must not drain.

## Regression test

`change-events.service.spec.ts` → `defers events recorded inside an open
transaction until it commits`: inside a `$transaction`, force the pass a
scheduled flush would run (`runFlush()`), assert nothing is published, commit,
then assert the `created` event arrives. It fails before the fix with the
exact CI assertion (`expected [] to have a length of 1`), and passes after.

## Verification

- Full backend suite: 36 files / 296 tests pass.
- 60 stressed runs of the spec pinned to 2 cores with two CPU burners (the
  pre-fix race reproduced once in 25 runs under the same setup): 0 failures.

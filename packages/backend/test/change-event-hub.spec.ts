import { describe, expect, it } from 'vitest';

import { ChangeEventHub } from '../src/events/change-event-hub.service';

import type { ChangeEvent } from '@taskora/shared';

describe('ChangeEventHub', () => {
  it('greets a fresh subscriber with hello carrying the current seq', () => {
    const hub = new ChangeEventHub();
    const seen: ChangeEvent[] = [];
    const { initialFrames } = hub.subscribe('u1', undefined, (event) => seen.push(event));

    expect(initialFrames).toHaveLength(1);
    expect(initialFrames[0]).toEqual({ type: 'hello', seq: hub.currentSeq('u1') });
    expect(seen).toEqual([]);
  });

  it('publishes events with strictly increasing seqs and fans out to listeners', () => {
    const hub = new ChangeEventHub();
    const a: ChangeEvent[] = [];
    const b: ChangeEvent[] = [];
    hub.subscribe('u1', undefined, (e) => a.push(e));
    hub.subscribe('u1', undefined, (e) => b.push(e));

    const first = hub.publish('u1', {
      entity: 'task',
      action: 'created',
      id: 't1',
      data: undefined,
    });
    const second = hub.publish('u1', { entity: 'task', action: 'updated', id: 't2' });

    expect(first.seq).toBeLessThan(second.seq);
    expect(a.map((e) => e.seq)).toEqual([first.seq, second.seq]);
    expect(b).toEqual(a);
  });

  it('keeps streams per user independent', () => {
    const hub = new ChangeEventHub();
    const u1: ChangeEvent[] = [];
    const u2: ChangeEvent[] = [];
    hub.subscribe('u1', undefined, (e) => u1.push(e));
    hub.subscribe('u2', undefined, (e) => u2.push(e));

    hub.publish('u1', { entity: 'task', action: 'created', id: 't1' });

    expect(u1).toHaveLength(1);
    expect(u2).toHaveLength(0);
  });

  it('replays missed events on reconnect with since', () => {
    const hub = new ChangeEventHub();
    const e1 = hub.publish('u1', { entity: 'task', action: 'created', id: 't1' });
    const e2 = hub.publish('u1', { entity: 'task', action: 'updated', id: 't2' });
    const e3 = hub.publish('u1', { entity: 'tag', action: 'created', id: 'g1' });

    const { initialFrames } = hub.subscribe('u1', e1.seq, () => {});
    expect(initialFrames).toEqual([
      { type: 'hello', seq: e3.seq },
      { type: 'change', event: e2 },
      { type: 'change', event: e3 },
    ]);
  });

  it('replays nothing when the client is fully caught up', () => {
    const hub = new ChangeEventHub();
    const e1 = hub.publish('u1', { entity: 'task', action: 'created', id: 't1' });

    const { initialFrames } = hub.subscribe('u1', e1.seq, () => {});
    expect(initialFrames).toEqual([{ type: 'hello', seq: e1.seq }]);
  });

  it('signals resync when the gap exceeds the ring buffer', () => {
    const hub = new ChangeEventHub();
    const first = hub.publish('u1', { entity: 'task', action: 'created', id: 't0' });
    for (let i = 1; i <= 600; i += 1) {
      hub.publish('u1', { entity: 'task', action: 'updated', id: `t${i}` });
    }

    const { initialFrames } = hub.subscribe('u1', first.seq, () => {});
    const hello = initialFrames[0];
    expect(hello?.type).toBe('hello');
    expect(initialFrames[1]).toEqual({ type: 'resync' });
  });

  it('signals resync when since points past the current seq (restart jump)', () => {
    const hub = new ChangeEventHub();
    const e1 = hub.publish('u1', { entity: 'task', action: 'created', id: 't1' });

    // A client from before a restart holds a far-future seq relative to a
    // freshly seeded hub state.
    const { initialFrames } = hub.subscribe('u1', e1.seq + 10_000, () => {});
    expect(initialFrames[0]?.type).toBe('hello');
    expect(initialFrames[1]).toEqual({ type: 'resync' });
  });

  it('stops delivering after unsubscribe', () => {
    const hub = new ChangeEventHub();
    const seen: ChangeEvent[] = [];
    const { unsubscribe } = hub.subscribe('u1', undefined, (e) => seen.push(e));

    hub.publish('u1', { entity: 'task', action: 'created', id: 't1' });
    unsubscribe();
    hub.publish('u1', { entity: 'task', action: 'created', id: 't2' });

    expect(seen).toHaveLength(1);
  });
});

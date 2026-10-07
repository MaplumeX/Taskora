import { describe, expect, it, vi } from 'vitest';

import { MemoryBlobCache } from './blob-cache';
import { BlobChannel, BlobUnavailableError, sha256Hex, type BlobTransport } from './blob-channel';

/** 进程内的 hub：按 hash 存字节；online 为 false 时一律网络失败。 */
function fakeHub() {
  const stored = new Map<string, Blob>();
  const state = { online: true, uploads: 0 };
  const guard = () => {
    if (!state.online) throw new Error('offline');
  };
  const transport: BlobTransport = {
    async exists(hash) {
      guard();
      return stored.has(hash);
    },
    async upload(hash, blob) {
      guard();
      state.uploads += 1;
      stored.set(hash, blob);
    },
    async download(hash) {
      guard();
      return stored.get(hash) ?? null;
    },
  };
  return { stored, state, transport };
}

const text = (value: string) => new Blob([value], { type: 'text/plain' });

function channel(
  hub: ReturnType<typeof fakeHub>,
  cache = new MemoryBlobCache(),
  user: string | null = 'u1',
) {
  return new BlobChannel({
    cache,
    transport: hub.transport,
    userId: () => user,
    retryDelay: () => 60_000,
  });
}

describe('BlobChannel（ADR-0019）', () => {
  it('add：算 sha256、入缓存与队列、后台上传；本机读取不走网络', async () => {
    const hub = fakeHub();
    const device = channel(hub);
    const { hash, size } = await device.add(text('hello'));
    expect(hash).toBe(await sha256Hex(text('hello')));
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(size).toBe(5);
    await device.kick();
    expect(hub.stored.has(hash)).toBe(true);
    hub.state.online = false;
    expect(await (await device.read(hash)).text()).toBe('hello');
  });

  it('离线添加：留在队列，联网后（重启后的新实例）续传；hub 已有同内容则不重传', async () => {
    const hub = fakeHub();
    const cache = new MemoryBlobCache();
    hub.state.online = false;
    const before = channel(hub, cache);
    const { hash } = await before.add(text('offline'));
    await before.kick();
    expect(before.activityOf(hash)).toBe('pending-upload');
    expect(await cache.pending()).toHaveLength(1);
    before.dispose();

    hub.state.online = true;
    const after = channel(hub, cache);
    await after.kick();
    expect(hub.stored.has(hash)).toBe(true);
    expect(await cache.pending()).toEqual([]);
    expect(after.activityOf(hash)).toBeNull();

    await after.add(text('offline'));
    await after.kick();
    expect(hub.state.uploads).toBe(1);
  });

  it('另一台设备：缓存未命中时下载并缓存；hub 还没有 → not-uploaded，离线 → offline', async () => {
    const hub = fakeHub();
    const uploader = channel(hub);
    const { hash } = await uploader.add(text('shared'));
    const reader = channel(hub);
    hub.state.online = false;
    await expect(reader.read(hash)).rejects.toMatchObject({ reason: 'offline' });
    hub.state.online = true;
    hub.stored.clear();
    await expect(reader.read(hash)).rejects.toBeInstanceOf(BlobUnavailableError);
    await uploader.kick();
    expect(await (await reader.read(hash)).text()).toBe('shared');
    hub.state.online = false;
    expect(await (await reader.read(hash)).text()).toBe('shared');
  });

  it('只传当前用户的队列项；缓存里字节丢了的队列项被撤掉', async () => {
    const hub = fakeHub();
    const cache = new MemoryBlobCache();
    await cache.markPending(`u2/${'a'.repeat(64)}`);
    await cache.markPending(`u1/${'b'.repeat(64)}`);
    await channel(hub, cache).kick();
    expect(await cache.pending()).toEqual([`u2/${'a'.repeat(64)}`]);
    expect(hub.state.uploads).toBe(0);
  });

  it('上传失败按退避重试', async () => {
    vi.useFakeTimers();
    try {
      const hub = fakeHub();
      hub.state.online = false;
      const device = channel(hub);
      const { hash } = await device.add(text('retry'));
      await device.kick();
      hub.state.online = true;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(hub.stored.has(hash)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

import { blobKey, parseBlobKey, type BlobCache } from './blob-cache';

/**
 * Blob 通道的设备端（ADR-0019）：文件内容的本地缓存、持久化上传队列与按需
 * 下载。与 Outbox 互不等待——附件元数据照常经 Engine 同步，字节在这里后台
 * 上传；另一台设备先收到元数据时，下载得到「等待上传」。
 */

/** 与 hub 的 Blob 接口（`/blobs/:sha256`）。 */
export interface BlobTransport {
  /** hub 上是否已有（同用户去重，省掉重复上传）。 */
  exists(hash: string): Promise<boolean>;
  upload(hash: string, blob: Blob): Promise<void>;
  /** 不存在（尚未上传）返回 null。 */
  download(hash: string): Promise<Blob | null>;
}

export type BlobActivity = 'uploading' | 'pending-upload' | 'downloading';

/** 读不到 Blob：hub 上还没有（上传它的设备还没传完），或离线且本机没有缓存。 */
export class BlobUnavailableError extends Error {
  readonly name = 'BlobUnavailableError';

  constructor(
    readonly hash: string,
    readonly reason: 'not-uploaded' | 'offline',
  ) {
    super(reason === 'not-uploaded' ? '文件还没有上传完成' : '离线且本机没有这个文件');
  }
}

export interface BlobChannelOptions {
  cache: BlobCache;
  transport: BlobTransport;
  /** 当前登录用户；未登录时为 null（不上传、不读写缓存）。 */
  userId: () => string | null;
  /** 失败后的重试间隔（毫秒），按次数退避；测试可注入。 */
  retryDelay?: (attempt: number) => number;
}

const MAX_RETRY_MS = 5 * 60_000;

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class BlobChannel {
  private readonly activity = new Map<string, BlobActivity>();
  private readonly listeners = new Set<() => void>();
  private uploading: Promise<void> | null = null;
  private rerun = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(private readonly options: BlobChannelOptions) {}

  /**
   * 收下一个本地文件：算 hash、写进缓存、入上传队列，并开始后台上传。返回
   * 写附件元数据所需的 hash 与大小。缓存与队列写完才返回——此后即使立刻
   * 断电，重启也会续传。
   */
  async add(blob: Blob): Promise<{ hash: string; size: number }> {
    const userId = this.requireUser();
    const hash = await sha256Hex(blob);
    const key = blobKey(userId, hash);
    await this.options.cache.put(key, blob);
    await this.options.cache.markPending(key);
    this.setActivity(hash, 'pending-upload');
    this.kick();
    return { hash, size: blob.size };
  }

  /** 读出 Blob：本机缓存优先，否则向 hub 下载并缓存。 */
  async read(hash: string): Promise<Blob> {
    const key = blobKey(this.requireUser(), hash);
    const cached = await this.options.cache.get(key);
    if (cached) return cached;
    this.setActivity(hash, 'downloading');
    try {
      let blob: Blob | null;
      try {
        blob = await this.options.transport.download(hash);
      } catch {
        throw new BlobUnavailableError(hash, 'offline');
      }
      if (!blob) throw new BlobUnavailableError(hash, 'not-uploaded');
      await this.options.cache.put(key, blob);
      return blob;
    } finally {
      this.setActivity(hash, null);
    }
  }

  /** 正在进行的传输（UI 的上传中 / 下载中）。 */
  activityOf(hash: string): BlobActivity | null {
    return this.activity.get(hash) ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 上传队列里的全部 Blob（当前用户），串行。已在进行时只标记再跑一轮。
   * 失败的留在队列里，按退避重试。
   */
  kick(): Promise<void> {
    if (this.uploading) {
      this.rerun = true;
      return this.uploading;
    }
    this.uploading = this.drain().finally(() => {
      this.uploading = null;
      if (this.rerun) {
        this.rerun = false;
        void this.kick();
      }
    });
    return this.uploading;
  }

  /** 停止重试（登出 / 卸载）。队列保留，下次 kick 续传。 */
  dispose(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.listeners.clear();
  }

  private async drain(): Promise<void> {
    const userId = this.options.userId();
    if (!userId) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    let failed = false;
    for (const key of await this.options.cache.pending()) {
      const parsed = parseBlobKey(key);
      if (!parsed || parsed.userId !== userId) continue;
      const { hash } = parsed;
      const blob = await this.options.cache.get(key);
      if (!blob) {
        // 字节丢了（缓存被系统清掉）：没法再传，撤掉队列项
        await this.options.cache.clearPending(key);
        this.setActivity(hash, null);
        continue;
      }
      this.setActivity(hash, 'uploading');
      try {
        if (!(await this.options.transport.exists(hash))) {
          await this.options.transport.upload(hash, blob);
        }
        await this.options.cache.clearPending(key);
        this.setActivity(hash, null);
      } catch {
        failed = true;
        this.setActivity(hash, 'pending-upload');
      }
    }
    if (failed) {
      this.attempt += 1;
      const delay =
        this.options.retryDelay?.(this.attempt) ??
        Math.min(MAX_RETRY_MS, 5_000 * 2 ** (this.attempt - 1));
      this.retryTimer = setTimeout(() => void this.kick(), delay);
    } else {
      this.attempt = 0;
    }
  }

  private requireUser(): string {
    const userId = this.options.userId();
    if (!userId) throw new Error('未登录，无法读写附件');
    return userId;
  }

  private setActivity(hash: string, activity: BlobActivity | null): void {
    if ((this.activity.get(hash) ?? null) === activity) return;
    if (activity) this.activity.set(hash, activity);
    else this.activity.delete(hash);
    this.listeners.forEach((listener) => listener());
  }
}

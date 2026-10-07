/**
 * 设备端 Blob 缓存与上传队列的存储（ADR-0019）。
 *
 * 缓存可随时丢弃重下——只有「待上传」的 Blob 是用户数据（hub 上还没有），
 * 在上传完成前不能淘汰。键带上用户 id：同一台设备换账号时互不可见，与 hub
 * 按用户隔离的命名空间一致。
 */
export interface BlobCache {
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  /** 待上传队列（持久化，重启后续传）。 */
  pending(): Promise<string[]>;
  markPending(key: string): Promise<void>;
  clearPending(key: string): Promise<void>;
}

/** 缓存键：`<userId>/<sha256>`。 */
export function blobKey(userId: string, hash: string): string {
  return `${userId}/${hash}`;
}

export function parseBlobKey(key: string): { userId: string; hash: string } | null {
  const at = key.lastIndexOf('/');
  if (at <= 0) return null;
  return { userId: key.slice(0, at), hash: key.slice(at + 1) };
}

/** 进程内缓存：测试，以及 Cache Storage 不可用（非安全上下文）时的退路。 */
export class MemoryBlobCache implements BlobCache {
  private readonly blobs = new Map<string, Blob>();
  private readonly queue = new Set<string>();

  async get(key: string): Promise<Blob | null> {
    return this.blobs.get(key) ?? null;
  }

  async put(key: string, blob: Blob): Promise<void> {
    this.blobs.set(key, blob);
  }

  async pending(): Promise<string[]> {
    return [...this.queue];
  }

  async markPending(key: string): Promise<void> {
    this.queue.add(key);
  }

  async clearPending(key: string): Promise<void> {
    this.queue.delete(key);
  }
}

/** Cache Storage 的键必须是 URL：用一个不会被真正请求的伪 origin。 */
const KEY_ORIGIN = 'https://blobs.taskora.invalid/';
const BLOB_CACHE = 'taskora-blobs';
const UPLOAD_QUEUE_CACHE = 'taskora-blob-uploads';

const keyUrl = (key: string) => `${KEY_ORIGIN}${key}`;

/**
 * Cache Storage（webview 的持久化存储，Web / 桌面 / 移动端通用）：字节放
 * `taskora-blobs`，待上传标记放 `taskora-blob-uploads`。大文件不进 JS 堆
 * 以外的额外副本，读出是惰性的 Blob。
 */
export class CacheStorageBlobCache implements BlobCache {
  constructor(private readonly storage: CacheStorage) {}

  async get(key: string): Promise<Blob | null> {
    const response = await (await this.storage.open(BLOB_CACHE)).match(keyUrl(key));
    return response ? response.blob() : null;
  }

  async put(key: string, blob: Blob): Promise<void> {
    await (await this.storage.open(BLOB_CACHE)).put(keyUrl(key), new Response(blob));
  }

  async pending(): Promise<string[]> {
    const requests = await (await this.storage.open(UPLOAD_QUEUE_CACHE)).keys();
    return requests.map((request) => request.url.slice(KEY_ORIGIN.length));
  }

  async markPending(key: string): Promise<void> {
    await (await this.storage.open(UPLOAD_QUEUE_CACHE)).put(keyUrl(key), new Response(''));
  }

  async clearPending(key: string): Promise<void> {
    await (await this.storage.open(UPLOAD_QUEUE_CACHE)).delete(keyUrl(key));
  }
}

/** 当前环境可用的缓存：有 Cache Storage（安全上下文）用它，否则退回进程内。 */
export function defaultBlobCache(): BlobCache {
  if (typeof caches !== 'undefined') return new CacheStorageBlobCache(caches);
  return new MemoryBlobCache();
}

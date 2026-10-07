import type { Readable } from 'node:stream';

/**
 * Blob 存储（ADR-0019）：Attachment 的文件内容，按 sha256 内容寻址、写入后
 * 不可变。按用户隔离——同一用户内同内容只存一份，跨用户从不去重（hash 不能
 * 被用来探测别人是否有某个文件）。
 *
 * v1 只有文件系统实现；接口留给以后的 S3 兼容后端。
 */
export abstract class BlobStore {
  /** Blob 的字节数与写入时刻；不存在返回 null。 */
  abstract stat(userId: string, hash: string): Promise<{ size: number; storedAt: Date } | null>;

  /**
   * 流式写入：边写边算 sha256，与 hash 不符时丢弃并抛 BlobHashMismatchError。
   * 已存在时仍读完 source（调用方的请求体），结果幂等。
   */
  abstract put(userId: string, hash: string, source: Readable): Promise<void>;

  /** 读出 Blob（可选闭区间字节范围）。调用方先 stat 确认存在。 */
  abstract read(userId: string, hash: string, range?: { start: number; end: number }): Readable;

  abstract remove(userId: string, hash: string): Promise<void>;

  /** 该用户全部 Blob（GC 用）。 */
  abstract list(userId: string): Promise<Array<{ hash: string; storedAt: Date }>>;

  /** 存有 Blob 的用户（GC 用）。 */
  abstract users(): Promise<string[]>;
}

export class BlobHashMismatchError extends Error {
  readonly name = 'BlobHashMismatchError';

  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`Blob 内容与 hash 不符：期望 ${expected}，实际 ${actual}`);
  }
}

import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** 预览后等待确认的上传最多保留这么久。 */
export const IMPORT_UPLOAD_TTL_MS = 60 * 60 * 1000;

const UPLOAD_ID_PATTERN = /^[0-9a-f-]{36}$/;

/**
 * 导入的临时上传：预览时落盘，确认导入时再读。按用户分目录，uploadId 是
 * 随机 UUID（也挡住路径穿越）；导入后或过期即删除。
 */
export class ImportUploads {
  constructor(private readonly root: string = join(tmpdir(), 'taskora-imports')) {}

  async save(userId: string, source: Readable): Promise<string> {
    await this.sweep();
    const uploadId = randomUUID();
    await mkdir(join(this.root, userId), { recursive: true });
    await pipeline(source, createWriteStream(this.pathOf(userId, uploadId)!));
    return uploadId;
  }

  /** 上传文件路径；uploadId 无效、不存在或已过期时为 null。 */
  async find(userId: string, uploadId: string): Promise<string | null> {
    const path = this.pathOf(userId, uploadId);
    if (!path) return null;
    const info = await stat(path).catch(() => null);
    if (!info || Date.now() - info.mtimeMs > IMPORT_UPLOAD_TTL_MS) return null;
    return path;
  }

  async remove(userId: string, uploadId: string): Promise<void> {
    const path = this.pathOf(userId, uploadId);
    if (path) await rm(path, { force: true });
  }

  /** 删除全部过期的上传。 */
  async sweep(now = Date.now()): Promise<void> {
    const users = await readdir(this.root).catch(() => [] as string[]);
    for (const user of users) {
      const dir = join(this.root, user);
      for (const name of await readdir(dir).catch(() => [] as string[])) {
        const path = join(dir, name);
        const info = await stat(path).catch(() => null);
        if (info && now - info.mtimeMs > IMPORT_UPLOAD_TTL_MS) await rm(path, { force: true });
      }
    }
  }

  private pathOf(userId: string, uploadId: string): string | null {
    return UPLOAD_ID_PATTERN.test(uploadId) ? join(this.root, userId, uploadId) : null;
  }
}

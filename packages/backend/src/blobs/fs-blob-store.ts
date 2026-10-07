import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { BlobHashMismatchError, BlobStore } from './blob-store';

/**
 * 文件系统 Blob 存储：`<root>/<userId>/<hash 前两位>/<hash>`。先写进
 * `<root>/.tmp/` 再 rename 到位——同一文件系统内 rename 是原子的，读者不会
 * 看到写了一半的 Blob；并发上传同一内容各写各的临时文件，后到的覆盖同内容。
 */
export class FsBlobStore extends BlobStore {
  constructor(private readonly root: string) {
    super();
  }

  private userDir(userId: string): string {
    return join(this.root, encodeURIComponent(userId));
  }

  private pathOf(userId: string, hash: string): string {
    return join(this.userDir(userId), hash.slice(0, 2), hash);
  }

  async stat(userId: string, hash: string): Promise<{ size: number; storedAt: Date } | null> {
    try {
      const info = await stat(this.pathOf(userId, hash));
      return { size: info.size, storedAt: info.mtime };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async put(userId: string, hash: string, source: Readable): Promise<void> {
    const tmpDir = join(this.root, '.tmp');
    await mkdir(tmpDir, { recursive: true });
    const tmp = join(tmpDir, randomUUID());
    const digest = createHash('sha256');
    try {
      await pipeline(
        source,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            digest.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(tmp),
      );
      const actual = digest.digest('hex');
      if (actual !== hash) throw new BlobHashMismatchError(hash, actual);
      const target = this.pathOf(userId, hash);
      await mkdir(join(this.userDir(userId), hash.slice(0, 2)), { recursive: true });
      await rename(tmp, target);
    } finally {
      await rm(tmp, { force: true });
    }
  }

  read(userId: string, hash: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.pathOf(userId, hash), range);
  }

  async remove(userId: string, hash: string): Promise<void> {
    await rm(this.pathOf(userId, hash), { force: true });
  }

  async list(userId: string): Promise<Array<{ hash: string; storedAt: Date }>> {
    const blobs: Array<{ hash: string; storedAt: Date }> = [];
    for (const shard of await readdirOrEmpty(this.userDir(userId))) {
      const dir = join(this.userDir(userId), shard);
      for (const hash of await readdirOrEmpty(dir)) {
        const info = await stat(join(dir, hash)).catch(() => null);
        if (info?.isFile()) blobs.push({ hash, storedAt: info.mtime });
      }
    }
    return blobs;
  }

  async users(): Promise<string[]> {
    return (await readdirOrEmpty(this.root))
      .filter((name) => name !== '.tmp')
      .map((name) => decodeURIComponent(name));
  }
}

async function readdirOrEmpty(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

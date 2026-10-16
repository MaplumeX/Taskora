import { createHash } from 'node:crypto';
import { open as openFile, readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';

import {
  BLOB_HASH_PATTERN,
  DATA_PACKAGE_BLOB_DIR,
  DATA_PACKAGE_DATA_PATH,
  DATA_PACKAGE_MANIFEST_PATH,
} from '@taskora/shared';
import yauzl from 'yauzl';

import { DataPackageError, isLegacyExport } from './package-format';

/** 打开的数据包：两份 JSON 已读出，Blob 按需流式读取。 */
export interface OpenedPackage {
  manifestJson: unknown;
  dataJson: unknown;
  blobHashes: ReadonlySet<string>;
  readBlob(hash: string): Promise<Readable>;
  close(): void;
}

const invalid = (message: string) => new DataPackageError('invalid-package', message);

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) =>
      error ? reject(invalid('不是有效的 zip 文件')) : resolve(zip),
    ),
  );
}

function listEntries(zip: yauzl.ZipFile): Promise<Map<string, yauzl.Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, yauzl.Entry>();
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', () => reject(invalid('zip 文件已损坏')));
    zip.readEntry();
  });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) =>
    zip.openReadStream(entry, (error, stream) =>
      error ? reject(invalid(`无法读取 ${entry.fileName}`)) : resolve(stream),
    ),
  );
}

async function readJson(zip: yauzl.ZipFile, entry: yauzl.Entry | undefined, name: string) {
  if (!entry) throw invalid(`缺少 ${name}`);
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of await openEntry(zip, entry)) chunks.push(chunk as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof DataPackageError) throw error;
    throw invalid(`${name} 不是有效的 JSON`);
  }
}

/** 文件是否以 zip 的本地文件头（PK\x03\x04）开始。 */
async function isZip(path: string): Promise<boolean> {
  const file = await openFile(path, 'r');
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await file.read(head, 0, 4, 0);
    return bytesRead === 4 && head.readUInt32LE(0) === 0x04034b50;
  } finally {
    await file.close();
  }
}

/**
 * 旧版导出的 JSON（format 0）：合成 manifest，exportId 取文件内容 hash，
 * 同一个文件再次导入时同样能提示「已导入过」。
 */
async function openLegacyJson(path: string): Promise<OpenedPackage> {
  const raw = await readFile(path);
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    throw invalid('不是有效的数据包');
  }
  if (!isLegacyExport(json)) throw invalid('不是有效的数据包');
  const legacy = json as { exportedAt?: unknown; version: string };
  return {
    manifestJson: {
      format: 0,
      exportId: `legacy-${createHash('sha256').update(raw).digest('hex')}`,
      exportedAt:
        typeof legacy.exportedAt === 'string' ? legacy.exportedAt : new Date().toISOString(),
      hubVersion: legacy.version,
      includesBlobs: false,
      counts: {},
    },
    dataJson: json,
    blobHashes: new Set(),
    readBlob: () => Promise.reject(invalid('旧版导出不含附件')),
    close: () => {},
  };
}

/** 打开磁盘上的数据包（`.taskora`，或旧版导出的 JSON）。调用方用完须 close()。 */
export async function openPackage(path: string): Promise<OpenedPackage> {
  if (!(await isZip(path))) return openLegacyJson(path);
  const zip = await openZip(path);
  try {
    const entries = await listEntries(zip);
    const blobs = new Map<string, yauzl.Entry>();
    for (const [name, entry] of entries) {
      if (!name.startsWith(DATA_PACKAGE_BLOB_DIR)) continue;
      const hash = name.slice(DATA_PACKAGE_BLOB_DIR.length);
      if (BLOB_HASH_PATTERN.test(hash)) blobs.set(hash, entry);
    }
    return {
      manifestJson: await readJson(
        zip,
        entries.get(DATA_PACKAGE_MANIFEST_PATH),
        DATA_PACKAGE_MANIFEST_PATH,
      ),
      dataJson: await readJson(zip, entries.get(DATA_PACKAGE_DATA_PATH), DATA_PACKAGE_DATA_PATH),
      blobHashes: new Set(blobs.keys()),
      readBlob: (hash) => openEntry(zip, blobs.get(hash)!),
      close: () => zip.close(),
    };
  } catch (error) {
    zip.close();
    throw error;
  }
}

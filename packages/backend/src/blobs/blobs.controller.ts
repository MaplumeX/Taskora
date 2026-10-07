import {
  BadRequestException,
  Controller,
  Get,
  Head,
  Headers,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { BLOB_HASH_PATTERN } from '@taskora/shared';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BlobHashMismatchError, BlobStore } from './blob-store';

/** 内容寻址：hash 只能是 sha256 的 64 位小写 hex（也挡住路径穿越）。 */
function requireHash(hash: string): string {
  if (!BLOB_HASH_PATTERN.test(hash)) throw new BadRequestException('无效的 Blob hash');
  return hash;
}

/**
 * 解析单段 Range 头（bytes=a-b / a- / -n）。没有或不支持（多段）时返回
 * undefined，回整份；范围不可满足返回 null（416）。
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | undefined {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (match[1] === '' && match[2] === '')) return undefined;
  let start: number;
  let end: number;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

/**
 * Blob 通道（ADR-0019）：Attachment 文件内容的上传 / 下载，不走 Change
 * Event，也不经过 JSON body parser、不设大小上限。按用户隔离：只能读写
 * 自己名下的 Blob。下载一律当作附件下载、禁止嗅探——内容类型由客户端按
 * Attachment 元数据决定，服务端从不内联渲染。
 */
@UseGuards(JwtAuthGuard)
@Controller('blobs')
export class BlobsController {
  constructor(private readonly store: BlobStore) {}

  @Head(':hash')
  async head(
    @Req() req: Request & { user: { id: string } },
    @Param('hash') hash: string,
    @Res() res: Response,
  ): Promise<void> {
    const info = await this.store.stat(req.user.id, requireHash(hash));
    if (!info) throw new NotFoundException();
    res.setHeader('Content-Length', info.size);
    res.status(200).end();
  }

  @Put(':hash')
  async put(
    @Req() req: Request & { user: { id: string } },
    @Param('hash') hash: string,
  ): Promise<{ hash: string; size: number }> {
    requireHash(hash);
    // JSON / 表单请求体已被 body parser 读走：只接受原始字节
    if (req.readableEnded || req.is(['application/json', 'application/x-www-form-urlencoded'])) {
      throw new UnsupportedMediaTypeException('Blob 以原始字节上传（application/octet-stream）');
    }
    try {
      await this.store.put(req.user.id, hash, req);
    } catch (error) {
      if (error instanceof BlobHashMismatchError) throw new BadRequestException(error.message);
      throw error;
    }
    const info = await this.store.stat(req.user.id, hash);
    return { hash, size: info?.size ?? 0 };
  }

  @Get(':hash')
  async get(
    @Req() req: Request & { user: { id: string } },
    @Param('hash') hash: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.id;
    const info = await this.store.stat(userId, requireHash(hash));
    if (!info) throw new NotFoundException();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    // 内容不可变：同一 hash 永远是同一份字节
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('ETag', `"${hash}"`);
    const range = parseRange(rangeHeader, info.size);
    if (range === null) {
      res.setHeader('Content-Range', `bytes */${info.size}`);
      res.status(416).end();
      return;
    }
    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`);
      res.setHeader('Content-Length', range.end - range.start + 1);
    } else {
      res.status(200);
      res.setHeader('Content-Length', info.size);
    }
    await pipeline(this.store.read(userId, hash, range), res);
  }
}

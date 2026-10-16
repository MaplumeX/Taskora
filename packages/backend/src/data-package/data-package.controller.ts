import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { DATA_PACKAGE_EXTENSION } from '@taskora/shared';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DataImportService } from './data-import.service';
import { DataPackageService } from './data-package.service';
import { ImportDataPackageDto } from './dto/data-import.dto';
import { DataPackageError } from './package-format';

/** 数据包读不了时以 422 + 错误码回给客户端（同日历订阅的惯例）。 */
async function asUnprocessable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DataPackageError) throw new UnprocessableEntityException(error.code);
    throw error;
  }
}

@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class DataPackageController {
  constructor(
    private readonly dataPackage: DataPackageService,
    private readonly dataImport: DataImportService,
  ) {}

  /** 导出数据包；`blobs=0` 时不含附件文件。 */
  @Get('export')
  async export(
    @Req() req: Request & { user: { id: string } },
    @Query('blobs') blobs: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { manifest, stream } = await this.dataPackage.exportPackage(req.user.id, {
      includeBlobs: blobs !== '0',
    });
    const date = manifest.exportedAt.slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="taskora-${date}${DATA_PACKAGE_EXTENSION}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    // 响应头已发出后出错只能断开连接，客户端会得到不完整的下载
    await pipeline(stream, res);
  }

  /**
   * 上传数据包并预览（原始字节，不经 JSON body parser、不设大小上限）。
   * 返回 uploadId，确认导入时带回。
   */
  @Post('import/preview')
  @HttpCode(200)
  preview(@Req() req: Request & { user: { id: string } }) {
    if (req.readableEnded || req.is(['application/json', 'application/x-www-form-urlencoded'])) {
      throw new UnsupportedMediaTypeException('数据包以原始字节上传（application/octet-stream）');
    }
    return asUnprocessable(() => this.dataImport.preview(req.user.id, req));
  }

  /** 把预览过的数据包作为新数据导入当前账号。 */
  @Post('import')
  @HttpCode(200)
  import(@Req() req: Request & { user: { id: string } }, @Body() dto: ImportDataPackageDto) {
    return asUnprocessable(() =>
      this.dataImport.import(req.user.id, dto.uploadId, {
        importPreferences: dto.importPreferences ?? false,
      }),
    );
  }
}

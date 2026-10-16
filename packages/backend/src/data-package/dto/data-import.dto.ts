import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ImportDataPackageDto {
  /** 预览接口返回的 uploadId。 */
  @IsUUID()
  uploadId!: string;

  /** 同时用数据包里的偏好整体覆盖当前账号偏好；缺省不导入。 */
  @IsOptional()
  @IsBoolean()
  importPreferences?: boolean;
}

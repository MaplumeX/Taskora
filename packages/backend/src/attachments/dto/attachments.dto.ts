import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAttachmentDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(0)
  size!: number;

  @Matches(/^[0-9a-f]{64}$/)
  blobHash!: string;
}

export class UpdateAttachmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

export class ReorderAttachmentsDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}

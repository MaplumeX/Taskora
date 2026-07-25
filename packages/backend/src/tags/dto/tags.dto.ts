import { Matches, IsOptional, IsString } from 'class-validator';

export class CreateTagDto {
  @IsString()
  title!: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a 6-digit hex string like #3B82F6',
  })
  color?: string;

  @IsOptional()
  @IsString()
  tagGroupId?: string | null;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a 6-digit hex string like #3B82F6',
  })
  color?: string;

  @IsOptional()
  @IsString()
  tagGroupId?: string | null;
}
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type {
  UpdateProfileDto as IUpdateProfileDto,
  UpdatePasswordDto as IUpdatePasswordDto,
} from '@taskora/shared';

export class UpdateProfileDto implements IUpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.avatarUrl != null)
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  avatarUrl?: string | null;
}

export class UpdatePasswordDto implements IUpdatePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

import {
  IsIn,
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
  UpdatePreferencesDto as IUpdatePreferencesDto,
  DeleteAccountDto as IDeleteAccountDto,
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

export class UpdatePreferencesDto implements IUpdatePreferencesDto {
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

  @IsOptional()
  @IsIn(['zh', 'en'])
  language?: 'zh' | 'en';

  @IsOptional()
  @IsIn([0, 1])
  weekStartsOn?: 0 | 1;
}

export class DeleteAccountDto implements IDeleteAccountDto {
  @IsString()
  @MinLength(1)
  password!: string;
}

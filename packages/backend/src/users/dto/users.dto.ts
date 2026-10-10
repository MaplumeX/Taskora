import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsTimeZone,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ReviewIntervalDefaultsDto } from '../../common/review-interval.dto';
import {
  LOGGING_MODES,
  TODAY_SEEN_KEY_PATTERN,
  TODAY_SEEN_KEYS_MAX,
  type LoggingMode,
} from '@taskora/shared';
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
  @ValidateIf((_, value) => value !== undefined)
  @IsTimeZone()
  timeZone?: string;

  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

  @IsOptional()
  @IsIn(['zh', 'en'])
  language?: 'zh' | 'en';

  @IsOptional()
  @IsIn([0, 1])
  weekStartsOn?: 0 | 1;

  @IsOptional()
  @IsBoolean()
  bucketGrouping?: boolean;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  todayReviewedOn?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TODAY_SEEN_KEYS_MAX)
  @Matches(TODAY_SEEN_KEY_PATTERN, { each: true })
  todaySeenKeys?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewIntervalDefaultsDto)
  defaultReviewIntervals?: ReviewIntervalDefaultsDto;

  @IsOptional()
  @IsIn(LOGGING_MODES)
  loggingMode?: LoggingMode;

  // null 合法（从未写过水位线）；undefined 表示不改
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsISO8601({ strict: true })
  loggedThrough?: string | null;
}

export class DeleteAccountDto implements IDeleteAccountDto {
  @IsString()
  @MinLength(1)
  password!: string;
}

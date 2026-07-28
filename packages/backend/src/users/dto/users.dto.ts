import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import type {
  UpdateProfileDto as IUpdateProfileDto,
  UpdatePasswordDto as IUpdatePasswordDto,
} from '@taskora/shared';

// Cache IANA timezone set once — Node 20+ supports Intl.supportedValuesOf('timeZone')
const SUPPORTED_TIMEZONES: ReadonlySet<string> = new Set(
  Intl.supportedValuesOf('timeZone') as string[],
);

@ValidatorConstraint({ name: 'isValidTimezone', async: false })
class IsValidTimezone implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    return typeof value === 'string' && SUPPORTED_TIMEZONES.has(value);
  }
  defaultMessage(): string {
    return 'Invalid IANA timezone';
  }
}

export class UpdateProfileDto implements IUpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.avatarUrl != null)
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  avatarUrl?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.timezone != null)
  @IsString()
  @Validate(IsValidTimezone)
  timezone?: string | null;

  @IsOptional()
  @IsIn(['zh', 'en'])
  locale?: string | null;
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

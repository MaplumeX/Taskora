import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  IsInt,
  IsIn,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TaskBucket, ScheduledType } from '@taskora/shared';

/**
 * Repeat Rule（recurring-tasks spec）：结构化规则对象的入参校验。
 * 形状与 @taskora/shared 的 RepeatRule 对齐；规范化（canonical form）由
 * @taskora/engine 的 normalizeRepeatRule 在写入时完成。
 */
export class RepeatRuleDto {
  @IsIn(['day', 'week', 'month', 'year'])
  unit!: 'day' | 'week' | 'month' | 'year';

  @IsInt()
  @Min(1)
  @Max(999)
  interval!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  weekdays?: number[];

  @IsIn(['scheduled', 'completion'])
  anchor!: 'scheduled' | 'completion';

  @IsOptional()
  @IsDateString()
  until?: string | null;
}

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsEnum(ScheduledType)
  scheduledType?: ScheduledType;

  @IsOptional()
  @IsDateString()
  dueDate?: string; // 通知日期（新增）

  @IsOptional()
  @IsEnum(TaskBucket)
  bucket?: TaskBucket;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string | null;

  @IsOptional()
  @IsEnum(ScheduledType)
  scheduledType?: ScheduledType;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'reminderTime must be an HH:mm time-of-day string',
  })
  reminderTime?: string | null;

  /** 重复规则：null 清除；对象经 normalizeRepeatRule 归一后落库。 */
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatRuleDto)
  repeatRule?: RepeatRuleDto | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null; // 通知日期（新增）

  @IsOptional()
  @IsEnum(TaskBucket)
  bucket?: TaskBucket;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  areaId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}

export class TaskQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(['inbox', 'today', 'upcoming', 'anytime', 'someday', 'trash', 'logbook'])
  view?: 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook';

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  tagId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  completed?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  hasScheduled?: boolean;
}

export class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}

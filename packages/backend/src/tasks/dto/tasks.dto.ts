import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TaskBucket, ScheduledType } from '@taskora/shared';

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
}

export class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}

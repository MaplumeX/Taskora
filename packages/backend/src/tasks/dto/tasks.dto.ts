import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TaskBucket } from '@taskora/shared';

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TaskBucket)
  bucket?: TaskBucket;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  areaId?: string;
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
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(TaskBucket)
  bucket?: TaskBucket;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  areaId?: string | null;
}

export class TaskQueryDto {
  @IsOptional()
  @IsEnum(['inbox', 'today', 'upcoming', 'anytime', 'someday', 'trash'])
  view?: 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash';

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

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
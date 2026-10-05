import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScheduledType, ProjectBucket, type SettleRemainingTasks } from '@taskora/shared';

import { RepeatRuleDto } from '../../tasks/dto/tasks.dto';

export class CreateProjectDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsEnum(ScheduledType)
  scheduledType?: ScheduledType;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(ProjectBucket)
  bucket?: ProjectBucket;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  areaId?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string | null;

  @IsOptional()
  @IsEnum(ScheduledType)
  scheduledType?: ScheduledType;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(ProjectBucket)
  bucket?: ProjectBucket;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  /** 重复规则（recurring-projects spec）：仅 DATE 项目生效；null 清除。 */
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatRuleDto)
  repeatRule?: RepeatRuleDto | null;
}

/** 完成项目：settleRemaining 给出时一并了结剩余任务（recurring-projects spec）。 */
export class CompleteProjectDto {
  @IsOptional()
  @IsIn(['completed', 'cancelled'])
  settleRemaining?: SettleRemainingTasks;
}

export class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
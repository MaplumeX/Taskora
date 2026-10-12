import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Start, type SettleRemainingTasks } from '@taskora/shared';

/** 项目的 start 只有 ANYTIME / SOMEDAY（ADR 0024）。 */
const PROJECT_STARTS = [Start.ANYTIME, Start.SOMEDAY];

import { ReviewIntervalDto } from '../../common/review-interval.dto';
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
  @IsIn(PROJECT_STARTS)
  start?: Start;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  /** 回顾间隔（Review Interval）。 */
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewIntervalDto)
  reviewInterval?: ReviewIntervalDto;

  /** 下次回顾日（YYYY-MM-DD）。 */
  @IsOptional()
  @IsDateString()
  nextReviewDate?: string;
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
  @IsIn(PROJECT_STARTS)
  start?: Start;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  /** 重复规则（recurring-projects spec）：仅 DATE 项目生效；null 清除。 */
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatRuleDto)
  repeatRule?: RepeatRuleDto | null;

  /** 回顾间隔（Review Interval）。 */
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewIntervalDto)
  reviewInterval?: ReviewIntervalDto;

  /** 下次回顾日（YYYY-MM-DD）。 */
  @IsOptional()
  @IsDateString()
  nextReviewDate?: string;

  /** Hide Later Items：是否隐藏稍后项。 */
  @IsOptional()
  @IsBoolean()
  hideLaterItems?: boolean;
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

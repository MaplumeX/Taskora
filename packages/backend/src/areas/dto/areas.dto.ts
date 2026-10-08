import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';

import { ReviewIntervalDto } from '../../common/review-interval.dto';

export class CreateAreaDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

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

export class UpdateAreaDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

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

export class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
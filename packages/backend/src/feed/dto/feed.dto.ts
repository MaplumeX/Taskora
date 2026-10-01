import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { FeedView } from '@taskora/shared';
import type { FeedItemType } from '@taskora/shared';

export class FeedOrderItemDto {
  @IsIn(['task', 'project'])
  type!: FeedItemType;

  @IsString()
  id!: string;
}

/** feed 拖拽重排：任务与项目行的目标显示顺序。 */
export class ReorderFeedDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => FeedOrderItemDto)
  items!: FeedOrderItemDto[];
}

export class FeedQueryDto {
  @IsOptional()
  @IsEnum(['inbox', 'today', 'upcoming', 'anytime', 'someday', 'trash', 'logbook'])
  view?: FeedView;
}
export class LogbookArchiveQueryDto {
  /** 归档截止：只返回在此之前了结的归档任务。 */
  @IsISO8601()
  settledBefore!: string;

  /** 上一页的 next。 */
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

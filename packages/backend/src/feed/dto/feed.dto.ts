import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { FeedView } from '@taskora/shared';

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

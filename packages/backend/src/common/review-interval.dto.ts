import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsInt, Min, ValidateNested } from 'class-validator';
import { REVIEW_UNITS, type ReviewUnit } from '@taskora/shared';

/** Review Interval（回顾间隔）：N × 单位，N 为不小于 1 的整数。 */
export class ReviewIntervalDto {
  @IsIn(REVIEW_UNITS)
  unit!: ReviewUnit;

  @IsInt()
  @Min(1)
  count!: number;
}

/** Default Review Interval（默认回顾间隔）：项目 / Area 两档。 */
export class ReviewIntervalDefaultsDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewIntervalDto)
  project!: ReviewIntervalDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewIntervalDto)
  area!: ReviewIntervalDto;
}

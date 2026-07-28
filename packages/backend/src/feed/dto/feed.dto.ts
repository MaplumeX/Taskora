import { IsEnum, IsOptional } from 'class-validator';
import { FeedView } from '@taskora/shared';

export class FeedQueryDto {
  @IsOptional()
  @IsEnum(['inbox', 'today', 'upcoming', 'anytime', 'someday', 'trash', 'logbook'])
  view?: FeedView;
}
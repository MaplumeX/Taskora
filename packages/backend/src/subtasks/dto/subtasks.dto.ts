import { IsArray, IsOptional, IsString } from 'class-validator';
import { TaskStatus } from '@taskora/shared';

export class CreateSubtaskDto {
  @IsString()
  title!: string;
}

export class UpdateSubtaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  status?: TaskStatus;
}

export class ReorderSubtasksDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}

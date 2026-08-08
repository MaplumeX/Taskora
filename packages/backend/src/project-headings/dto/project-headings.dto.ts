import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateProjectHeadingDto {
  @IsString()
  projectId!: string;

  @IsString()
  title!: string;
}

export class ProjectHeadingQueryDto {
  @IsString()
  projectId!: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  includeArchived?: boolean;
}

export class UpdateProjectHeadingDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class ProjectHeadingLayoutGroupDto {
  @IsString()
  headingId!: string;

  @IsArray()
  @IsString({ each: true })
  taskIds!: string[];
}

export class ReorderProjectHeadingLayoutDto {
  @IsString()
  projectId!: string;

  @IsArray()
  @IsString({ each: true })
  ungroupedTaskIds!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectHeadingLayoutGroupDto)
  groups!: ProjectHeadingLayoutGroupDto[];
}

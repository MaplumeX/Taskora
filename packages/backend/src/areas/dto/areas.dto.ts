import { IsArray, IsOptional, IsString } from 'class-validator';

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
}

export class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
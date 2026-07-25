import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateAreaDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAreaDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReorderDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
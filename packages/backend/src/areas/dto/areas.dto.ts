import { IsOptional, IsString } from 'class-validator';

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
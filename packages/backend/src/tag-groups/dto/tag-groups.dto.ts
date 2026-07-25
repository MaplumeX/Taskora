import { IsOptional, IsString } from 'class-validator';

export class CreateTagGroupDto {
  @IsString()
  title!: string;
}

export class UpdateTagGroupDto {
  @IsOptional()
  @IsString()
  title?: string;
}
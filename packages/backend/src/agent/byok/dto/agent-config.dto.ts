import { IsOptional, IsString, MaxLength } from 'class-validator';

import type { TestAgentConfigDto, UpdateAgentConfigDto } from '@taskora/shared';

export class UpdateAgentConfigBody implements UpdateAgentConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  modelId?: string;
}

export class TestAgentConfigBody implements TestAgentConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  modelId?: string;
}

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { AGENT_THINKING_LEVELS } from '@taskora/shared';
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

  @IsOptional()
  @IsIn([...AGENT_THINKING_LEVELS])
  thinkingLevel?: UpdateAgentConfigDto['thinkingLevel'];
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

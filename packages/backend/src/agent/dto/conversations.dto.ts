import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import type {
  CreateConversationDto,
  RenameConversationDto,
  SendConversationMessageDto,
  ResolveApprovalDto,
} from '@taskora/shared';

export class CreateConversationBody implements CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class RenameConversationBody implements RenameConversationDto {
  @IsString()
  @Length(1, 200)
  title!: string;
}

export class SendConversationMessageBody implements SendConversationMessageDto {
  @IsString()
  @Length(1, 32_000)
  content!: string;
}

export class ResolveApprovalBody implements ResolveApprovalDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';
}

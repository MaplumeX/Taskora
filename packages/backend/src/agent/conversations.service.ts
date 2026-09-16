import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { ConversationDto, ConversationMessageDto, AgentMessageJson } from '@taskora/shared';
import type { AgentMessage } from '@earendil-works/pi-agent-core';

/**
 * Conversation persistence (issue 05). Messages are stored as serialized
 * pi-agent-core `AgentMessage` JSON in order, so the runtime can rebuild
 * `agent.state.messages` after a restart and continue where it left off.
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ConversationDto[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(userId: string, title?: string): Promise<ConversationDto> {
    const row = await this.prisma.conversation.create({
      data: { userId, title: title ?? null },
    });
    return this.toDto(row);
  }

  async get(userId: string, id: string): Promise<ConversationDto> {
    const row = await this.prisma.conversation.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Conversation not found');
    return this.toDto(row);
  }

  async rename(userId: string, id: string, title: string): Promise<ConversationDto> {
    await this.ensureOwned(userId, id);
    const row = await this.prisma.conversation.update({
      where: { id },
      data: { title },
    });
    return this.toDto(row);
  }

  async setTitleIfUnset(id: string, title: string): Promise<void> {
    await this.prisma.conversation.updateMany({
      where: { id, title: null },
      data: { title },
    });
  }

  async touch(id: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.ensureOwned(userId, id);
    await this.prisma.conversation.delete({ where: { id } });
  }

  async listMessages(userId: string, conversationId: string): Promise<ConversationMessageDto[]> {
    await this.ensureOwned(userId, conversationId);
    const rows = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { seq: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      message: row.message as AgentMessageJson,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Append one message with the next sequence number. */
  async appendMessage(
    conversationId: string,
    message: AgentMessage,
    seq: number,
  ): Promise<ConversationMessageDto> {
    const row = await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        seq,
        message: message as unknown as object,
      },
    });
    return {
      id: row.id,
      seq: row.seq,
      message: row.message as AgentMessageJson,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** All stored messages in order — used to rebuild agent state. */
  async loadMessages(conversationId: string): Promise<AgentMessage[]> {
    const rows = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { seq: 'asc' },
    });
    return rows.map((row) => row.message as unknown as AgentMessage);
  }

  async countMessages(conversationId: string): Promise<number> {
    return this.prisma.conversationMessage.count({ where: { conversationId } });
  }

  private async ensureOwned(userId: string, id: string): Promise<void> {
    const row = await this.prisma.conversation.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Conversation not found');
  }

  private toDto(row: {
    id: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ConversationDto {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { AgentRuntimeService } from './runtime/agent-runtime.service';
import { AgentEventHub } from './runtime/agent-event-hub';
import { AgentApprovalService } from './approvals/approval.service';
import {
  CreateConversationBody,
  RenameConversationBody,
  ResolveApprovalBody,
  SendConversationMessageBody,
} from './dto/conversations.dto';

@UseGuards(JwtAuthGuard)
@Controller('agent/conversations')
export class AgentConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly runtime: AgentRuntimeService,
    private readonly hub: AgentEventHub,
    private readonly approvals: AgentApprovalService,
  ) {}

  @Get()
  list(@Request() req: { user: { id: string } }) {
    return this.conversations.list(req.user.id);
  }

  @Post()
  create(@Request() req: { user: { id: string } }, @Body() body: CreateConversationBody) {
    return this.conversations.create(req.user.id, body.title);
  }

  @Patch(':id')
  rename(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: RenameConversationBody,
  ) {
    return this.conversations.rename(req.user.id, id, body.title);
  }

  @Delete(':id')
  async remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    await this.runtime.destroyConversation(req.user.id, id);
    await this.conversations.delete(req.user.id, id);
    return { ok: true };
  }

  @Get(':id/messages')
  listMessages(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.conversations.listMessages(req.user.id, id);
  }

  /** Send a user message; the reply streams over the SSE endpoint. */
  @Post(':id/messages')
  async sendMessage(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: SendConversationMessageBody,
  ) {
    await this.runtime.sendMessage(req.user.id, id, body.content);
    return { ok: true };
  }

  /** Pending approvals (re-rendered after reconnects). */
  @Get(':id/approvals')
  listApprovals(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.approvals.listPending(req.user.id, id);
  }

  /** Approve or reject a destructive tool call. */
  @Post(':id/approvals/:approvalId')
  resolveApproval(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @Body() body: ResolveApprovalBody,
  ) {
    return this.approvals.resolve(req.user.id, id, approvalId, body.decision);
  }

  /**
   * SSE stream of agent events for one conversation. Clients reconnect freely:
   * message history is fetched from the REST endpoint, which is the durable
   * source of truth; this channel only carries live updates.
   */
  @Get(':id/events')
  async events(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Req() rawReq: ExpressRequest,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    // Ownership check before opening the stream (throws 404 through the
    // global exception filter while we are still in JSON mode).
    await this.conversations.get(req.user.id, id);

    res.status(200).setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const unsubscribe = this.hub.subscribe(id, (event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 25_000);
    heartbeat.unref();

    rawReq.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}

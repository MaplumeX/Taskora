import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AgentRuntimeService } from '../runtime/agent-runtime.service';
import { AgentConfigService } from './agent-config.service';
import { TestAgentConfigBody, UpdateAgentConfigBody } from './dto/agent-config.dto';

@UseGuards(JwtAuthGuard)
@Controller('agent/config')
export class AgentConfigController {
  constructor(
    private readonly agentConfigService: AgentConfigService,
    private readonly runtime: AgentRuntimeService,
  ) {}

  @Get()
  getConfig(@Request() req: { user: { id: string } }) {
    return this.agentConfigService.getConfig(req.user.id);
  }

  @Put()
  async updateConfig(
    @Request() req: { user: { id: string } },
    @Body() body: UpdateAgentConfigBody,
  ) {
    const config = await this.agentConfigService.updateConfig(req.user.id, body);
    // Drop cached Agent instances so the new key/model applies immediately.
    this.runtime.resetForUser(req.user.id);
    return config;
  }

  @Get('models')
  listModels(@Request() req: { user: { id: string } }) {
    return this.agentConfigService.listModels(req.user.id);
  }

  @Post('test')
  testConnection(@Request() req: { user: { id: string } }, @Body() body: TestAgentConfigBody) {
    return this.agentConfigService.testConnection(req.user.id, body);
  }
}

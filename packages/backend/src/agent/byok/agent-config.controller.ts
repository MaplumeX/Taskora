import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AgentConfigService } from './agent-config.service';
import { TestAgentConfigBody, UpdateAgentConfigBody } from './dto/agent-config.dto';

@UseGuards(JwtAuthGuard)
@Controller('agent/config')
export class AgentConfigController {
  constructor(private readonly agentConfigService: AgentConfigService) {}

  @Get()
  getConfig(@Request() req: { user: { id: string } }) {
    return this.agentConfigService.getConfig(req.user.id);
  }

  @Put()
  updateConfig(@Request() req: { user: { id: string } }, @Body() body: UpdateAgentConfigBody) {
    return this.agentConfigService.updateConfig(req.user.id, body);
  }

  @Post('test')
  testConnection(@Request() req: { user: { id: string } }, @Body() body: TestAgentConfigBody) {
    return this.agentConfigService.testConnection(req.user.id, body);
  }
}

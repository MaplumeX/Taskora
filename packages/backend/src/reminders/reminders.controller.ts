import { Controller, Get, Request, UseGuards } from '@nestjs/common';

import { BackgroundTokenGuard } from './background-token.guard';
import { RemindersService } from './reminders.service';

/**
 * Android 后台同步（local-first-v3 issue 09）：原生 WorkManager 任务周期性
 * 取回完整提醒计划。只接受设备后台凭据。
 */
@UseGuards(BackgroundTokenGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('plan')
  async plan(@Request() req: { user: { id: string } }) {
    return { ...(await this.reminders.plan(req.user.id)), serverTime: Date.now() };
  }
}

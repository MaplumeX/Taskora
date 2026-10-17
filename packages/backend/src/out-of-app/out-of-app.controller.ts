import { Body, Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';

import { BackgroundTokenGuard } from '../reminders/background-token.guard';
import { QuickAddDto, ReminderActionDto } from './dto/out-of-app.dto';
import { OutOfAppService } from './out-of-app.service';

/**
 * App 外写入（android-out-of-app-writes）：只接受设备后台凭据，请求只来自
 * Android 原生的送达任务。
 */
@UseGuards(BackgroundTokenGuard)
@Controller()
export class OutOfAppController {
  constructor(private readonly outOfApp: OutOfAppService) {}

  /** 丢弃（过期 / 已了结 / 不存在）也是 200：送达方据此删掉队列条目。 */
  @Post('reminders/actions')
  @HttpCode(200)
  reminderAction(@Request() req: { user: { id: string } }, @Body() body: ReminderActionDto) {
    return this.outOfApp.applyReminderAction(req.user.id, body);
  }

  @Post('quick-add')
  @HttpCode(200)
  quickAdd(@Request() req: { user: { id: string } }, @Body() body: QuickAddDto) {
    return this.outOfApp.quickAdd(req.user.id, body.id, body.draft);
  }
}

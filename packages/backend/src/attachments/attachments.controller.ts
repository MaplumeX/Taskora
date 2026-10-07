import { Body, Controller, Delete, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import {
  CreateAttachmentDto,
  ReorderAttachmentsDto,
  UpdateAttachmentDto,
} from './dto/attachments.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  // POST /tasks/:taskId/attachments/reorder — must precede :taskId/attachments/:id patterns
  @Post('tasks/:taskId/attachments/reorder')
  reorder(
    @Request() req: { user: { id: string } },
    @Param('taskId') taskId: string,
    @Body() dto: ReorderAttachmentsDto,
  ) {
    return this.attachmentsService.reorder(req.user.id, taskId, dto.orderedIds);
  }

  // POST /tasks/:taskId/attachments — 写附件元数据（Blob 已上传）
  @Post('tasks/:taskId/attachments')
  create(
    @Request() req: { user: { id: string } },
    @Param('taskId') taskId: string,
    @Body() dto: CreateAttachmentDto,
  ) {
    return this.attachmentsService.create(req.user.id, taskId, dto);
  }

  // PATCH /attachments/:id — rename
  @Patch('attachments/:id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateAttachmentDto,
  ) {
    return this.attachmentsService.update(req.user.id, id, dto);
  }

  // DELETE /attachments/:id
  @Delete('attachments/:id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.attachmentsService.remove(req.user.id, id);
  }
}

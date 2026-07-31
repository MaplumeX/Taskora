import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SubtasksService } from './subtasks.service';
import { CreateSubtaskDto, UpdateSubtaskDto, ReorderSubtasksDto } from './dto/subtasks.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class SubtasksController {
  constructor(private readonly subtasksService: SubtasksService) {}

  // POST /tasks/:taskId/subtasks/reorder — must precede :taskId/subtasks/:subtaskId patterns
  @Post('tasks/:taskId/subtasks/reorder')
  reorder(
    @Request() req: { user: { id: string } },
    @Param('taskId') taskId: string,
    @Body() dto: ReorderSubtasksDto,
  ) {
    return this.subtasksService.reorder(req.user.id, taskId, dto.orderedIds);
  }

  // POST /tasks/:taskId/subtasks — create subtask
  @Post('tasks/:taskId/subtasks')
  create(
    @Request() req: { user: { id: string } },
    @Param('taskId') taskId: string,
    @Body() dto: CreateSubtaskDto,
  ) {
    return this.subtasksService.create(req.user.id, taskId, dto);
  }

  // PATCH /subtasks/:id — update (title / status)
  @Patch('subtasks/:id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateSubtaskDto,
  ) {
    return this.subtasksService.update(req.user.id, id, dto);
  }

  // DELETE /subtasks/:id — delete
  @Delete('subtasks/:id')
  remove(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.subtasksService.remove(req.user.id, id);
  }

  // POST /subtasks/:id/complete
  @Post('subtasks/:id/complete')
  complete(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.subtasksService.complete(req.user.id, id);
  }

  // POST /subtasks/:id/uncomplete
  @Post('subtasks/:id/uncomplete')
  uncomplete(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.subtasksService.uncomplete(req.user.id, id);
  }
}

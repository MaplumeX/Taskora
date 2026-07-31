import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto, ReorderDto } from './dto/tasks.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('reorder')
  reorder(
    @Request() req: { user: { id: string } },
    @Body() dto: ReorderDto,
  ) {
    return this.tasksService.reorder(req.user.id, dto.orderedIds);
  }

  @Post()
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(req.user.id, dto);
  }

  @Get()
  findAll(
    @Request() req: { user: { id: string } },
    @Query() query: TaskQueryDto,
  ) {
    return this.tasksService.findAll(req.user.id, query);
  }

  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tasksService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tasksService.remove(req.user.id, id);
  }

  @Post(':id/restore')
  restore(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.tasksService.restore(req.user.id, id);
  }

  @Post(':id/complete')
  complete(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.tasksService.complete(req.user.id, id);
  }

  @Post(':id/uncomplete')
  uncomplete(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.tasksService.uncomplete(req.user.id, id);
  }

  @Post(':id/convert-to-project')
  convertToProject(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.tasksService.convertToProject(req.user.id, id);
  }
}
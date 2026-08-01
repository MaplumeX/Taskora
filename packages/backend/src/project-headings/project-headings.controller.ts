import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateProjectHeadingDto,
  ProjectHeadingQueryDto,
  ReorderProjectHeadingLayoutDto,
  UpdateProjectHeadingDto,
} from './dto/project-headings.dto';
import { ProjectHeadingsService } from './project-headings.service';

@UseGuards(JwtAuthGuard)
@Controller('project-headings')
export class ProjectHeadingsController {
  constructor(private readonly headingsService: ProjectHeadingsService) {}

  @Get()
  findAll(@Request() req: { user: { id: string } }, @Query() query: ProjectHeadingQueryDto) {
    return this.headingsService.findAll(req.user.id, query.projectId);
  }

  @Post()
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateProjectHeadingDto) {
    return this.headingsService.create(req.user.id, dto);
  }

  @Post('reorder')
  reorder(@Request() req: { user: { id: string } }, @Body() dto: ReorderProjectHeadingLayoutDto) {
    return this.headingsService.reorder(req.user.id, dto);
  }

  @Post(':id/convert-to-project')
  convertToProject(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.headingsService.convertToProject(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateProjectHeadingDto,
  ) {
    return this.headingsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.headingsService.remove(req.user.id, id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto, ReorderDto } from './dto/projects.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('reorder')
  reorder(
    @Request() req: { user: { id: string } },
    @Body() dto: ReorderDto,
  ) {
    return this.projectsService.reorder(req.user.id, dto.orderedIds);
  }

  @Post()
  create(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.projectsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.projectsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.projectsService.remove(req.user.id, id);
  }
}
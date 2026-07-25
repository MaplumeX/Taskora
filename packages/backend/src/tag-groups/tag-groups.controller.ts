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
import { TagGroupsService } from './tag-groups.service';
import { CreateTagGroupDto, UpdateTagGroupDto } from './dto/tag-groups.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tag-groups')
export class TagGroupsController {
  constructor(private readonly tagGroupsService: TagGroupsService) {}

  @Post()
  create(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateTagGroupDto,
  ) {
    return this.tagGroupsService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.tagGroupsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tagGroupsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateTagGroupDto,
  ) {
    return this.tagGroupsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tagGroupsService.remove(req.user.id, id);
  }
}
import { Controller, Get, Post, Query, UseGuards, Request } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedQueryDto } from './dto/feed.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Post('trash/empty')
  emptyTrash(@Request() req: { user: { id: string } }) {
    return this.feedService.emptyTrash(req.user.id);
  }

  @Get()
  findAll(
    @Request() req: { user: { id: string } },
    @Query() query: FeedQueryDto,
  ) {
    return this.feedService.findAll(req.user.id, query.view ?? 'inbox');
  }
}
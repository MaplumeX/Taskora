import { Body, Controller, Get, Post, Query, UseGuards, Request } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedQueryDto, LogbookArchiveQueryDto, ReorderFeedDto } from './dto/feed.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  /** feed 拖拽重排：任务写 position，项目写 feedPosition（feed-project-ordering spec）。 */
  @Post('reorder')
  reorder(@Request() req: { user: { id: string } }, @Body() dto: ReorderFeedDto) {
    return this.feedService.reorder(req.user.id, dto.items);
  }

  @Post('trash/empty')
  emptyTrash(@Request() req: { user: { id: string } }) {
    return this.feedService.emptyTrash(req.user.id);
  }

  /** Logbook 的归档部分（local-first-v3 issue 08）：副本不保留的旧 Logbook Entry。 */
  @Get('logbook/archive')
  logbookArchive(@Request() req: { user: { id: string } }, @Query() query: LogbookArchiveQueryDto) {
    return this.feedService.logbookArchive(
      req.user.id,
      new Date(query.settledBefore),
      query.page,
      query.limit,
    );
  }

  @Get()
  findAll(@Request() req: { user: { id: string } }, @Query() query: FeedQueryDto) {
    return this.feedService.findAll(req.user.id, query.view ?? 'inbox');
  }
}

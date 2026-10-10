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
import { CalendarService } from './calendar.service';
import {
  CalendarEventsQuery,
  CreateCalendarSubscriptionBody,
  UpdateCalendarSubscriptionBody,
} from './dto/calendar.dto';

/** 日历订阅与日程（ADR 0023）。 */
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('subscriptions')
  list(@Request() req: { user: { id: string } }) {
    return this.calendar.list(req.user.id);
  }

  @Post('subscriptions')
  create(@Request() req: { user: { id: string } }, @Body() body: CreateCalendarSubscriptionBody) {
    return this.calendar.create(req.user.id, body);
  }

  @Patch('subscriptions/:id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: UpdateCalendarSubscriptionBody,
  ) {
    return this.calendar.update(req.user.id, id, body);
  }

  @Delete('subscriptions/:id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.calendar.remove(req.user.id, id);
  }

  @Get('events')
  events(@Request() req: { user: { id: string } }, @Query() query: CalendarEventsQuery) {
    return this.calendar.events(req.user.id, query.from, query.to);
  }
}

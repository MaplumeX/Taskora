import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

import {
  CALENDAR_COLORS,
  type CalendarColor,
  type CreateCalendarSubscriptionDto,
  type UpdateCalendarSubscriptionDto,
} from '@taskora/shared';

export class CreateCalendarSubscriptionBody implements CreateCalendarSubscriptionDto {
  @IsString()
  @Length(1, 2048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(CALENDAR_COLORS)
  color?: CalendarColor;
}

export class UpdateCalendarSubscriptionBody implements UpdateCalendarSubscriptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsIn(CALENDAR_COLORS)
  color?: CalendarColor;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class CalendarEventsQuery {
  @Matches(DATE_KEY)
  from!: string;

  @Matches(DATE_KEY)
  to!: string;
}

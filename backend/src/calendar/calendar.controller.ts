import { Controller, Get, Param, Query } from '@nestjs/common';
import type {
  CalendarBlockWithTitles,
  SchedulingItem,
} from './calendar.service';
import { CalendarService } from './calendar.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/cycles/:id/calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  get(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): {
    blocks: CalendarBlockWithTitles[];
    scheduling: SchedulingItem[];
    current_week: number | null;
  } {
    return this.calendar.getCalendar(id, from, to);
  }
}

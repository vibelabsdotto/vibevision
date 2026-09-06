import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { AppEvent, EventBody, EventListQuery } from './events.service';
import { EventsService } from './events.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
// Append-only: GET + POST, no PUT/DELETE.
@Controller('v1/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(
    @Query()
    query: EventListQuery,
  ): { events: AppEvent[]; total: number; page: number; limit: number } {
    return this.events.list(query ?? {});
  }

  @Post()
  @HttpCode(201)
  record(@Body() body: EventBody): { event: AppEvent } {
    return { event: this.events.record(body ?? {}) };
  }
}

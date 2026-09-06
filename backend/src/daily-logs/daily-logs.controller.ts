import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { str } from '../common/util';
import type {
  DailyLog,
  DailyLogBody,
  DailyLogListQuery,
} from './daily-logs.dto';
import { DailyLogsService } from './daily-logs.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/daily-logs')
export class DailyLogsController {
  constructor(private readonly logs: DailyLogsService) {}

  @Get()
  listOrGet(
    @Query()
    query: DailyLogListQuery,
  ):
    | { daily_logs: DailyLog[]; total: number; page: number; limit: number }
    | { daily_log: DailyLog | null } {
    if (query?.date !== undefined) {
      return {
        daily_log: this.logs.getByCycleAndDate(str(query.cycle_id), query.date),
      };
    }
    return this.logs.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { daily_log: DailyLog } {
    return { daily_log: this.logs.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: DailyLogBody): { daily_log: DailyLog } {
    return { daily_log: this.logs.create(body ?? {}) };
  }

  @Post('checkin')
  @HttpCode(200)
  checkin(@Body() body: Record<string, unknown>): { daily_log: DailyLog } {
    return { daily_log: this.logs.checkin(body ?? {}) };
  }

  @Put()
  upsert(@Body() body: DailyLogBody): { daily_log: DailyLog } {
    return { daily_log: this.logs.upsert(body ?? {}) };
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: DailyLogBody,
  ): { daily_log: DailyLog } {
    return { daily_log: this.logs.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.logs.remove(id);
  }
}

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
import { Auth } from '../auth/auth.decorator';
import type { AuthContext } from '../auth/auth.types';
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
    @Auth() auth: AuthContext,
    @Query()
    query: DailyLogListQuery,
  ):
    | { daily_logs: DailyLog[]; total: number; page: number; limit: number }
    | { daily_log: DailyLog | null } {
    if (query?.date !== undefined) {
      return {
        daily_log: this.logs.getByCycleAndDate(
          auth.userId,
          str(query.cycle_id),
          query.date,
        ),
      };
    }
    return this.logs.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { daily_log: DailyLog } {
    return { daily_log: this.logs.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: DailyLogBody,
  ): { daily_log: DailyLog } {
    return { daily_log: this.logs.create(auth.userId, body ?? {}) };
  }

  @Post('checkin')
  @HttpCode(200)
  checkin(
    @Auth() auth: AuthContext,
    @Body() body: Record<string, unknown>,
  ): { daily_log: DailyLog } {
    return { daily_log: this.logs.checkin(auth.userId, body ?? {}) };
  }

  @Put()
  upsert(
    @Auth() auth: AuthContext,
    @Body() body: DailyLogBody,
  ): { daily_log: DailyLog } {
    return { daily_log: this.logs.upsert(auth.userId, body ?? {}) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: DailyLogBody,
  ): { daily_log: DailyLog } {
    return { daily_log: this.logs.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.logs.remove(auth.userId, id);
  }
}

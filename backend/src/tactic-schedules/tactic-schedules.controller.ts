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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  TacticSchedule,
  TacticScheduleBody,
  TacticScheduleListQuery,
} from './tactic-schedules.dto';
import { TacticSchedulesService } from './tactic-schedules.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/tactic-schedules')
export class TacticSchedulesController {
  constructor(private readonly schedules: TacticSchedulesService) {}

  @Get()
  list(
    @Query()
    query: TacticScheduleListQuery,
  ): {
    tactic_schedules: TacticSchedule[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.schedules.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { tactic_schedule: TacticSchedule } {
    return { tactic_schedule: this.schedules.get(id) };
  }

  /** Upsert per (tactic_id, week_number): 201 on create, 200 on update. */
  @Post()
  upsert(
    @Body() body: TacticScheduleBody,
    @Res({ passthrough: true }) res: Response,
  ): { tactic_schedule: TacticSchedule } {
    const { schedule, created } = this.schedules.upsert(body ?? {});
    res.status(created ? 201 : 200);
    return { tactic_schedule: schedule };
  }

  @Put(':id')
  @HttpCode(200)
  update(
    @Param('id') id: string,
    @Body() body: TacticScheduleBody,
  ): { tactic_schedule: TacticSchedule } {
    return { tactic_schedule: this.schedules.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.schedules.remove(id);
  }
}

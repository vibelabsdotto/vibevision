import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import type { AuthContext } from '../auth/auth.types';
import type { CycleWeek, CycleWeekListQuery } from './cycle-weeks.service';
import { CycleWeeksService } from './cycle-weeks.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
// Weeks are created by POST /v1/cycles: read + label update only.
@Controller('v1/cycle-weeks')
export class CycleWeeksController {
  constructor(private readonly weeks: CycleWeeksService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query()
    query: CycleWeekListQuery,
  ): {
    cycle_weeks: CycleWeek[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.weeks.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { cycle_week: CycleWeek } {
    return { cycle_week: this.weeks.get(auth.userId, id) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: { label?: unknown },
  ): { cycle_week: CycleWeek } {
    return { cycle_week: this.weeks.update(auth.userId, id, body ?? {}) };
  }
}

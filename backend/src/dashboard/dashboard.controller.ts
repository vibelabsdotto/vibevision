import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import type { AuthContext } from '../auth/auth.types';
import type { DashboardData } from './dashboard.service';
import { DashboardService } from './dashboard.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(
    @Auth() auth: AuthContext,
    @Query('cycle_id') cycleId?: string,
    @Query('as_of') asOf?: string,
  ): { dashboard: DashboardData | null } {
    return this.dashboard.getDashboard(auth.userId, cycleId, asOf);
  }
}

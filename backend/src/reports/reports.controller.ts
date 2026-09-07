import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Auth } from '../auth/auth.decorator';
import type { AuthContext } from '../auth/auth.types';
import type { WeekReport } from './reports.service';
import { ReportsService } from './reports.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/cycles/:id/weeks/:n/report')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Param('n') n: string,
    @Query('format') format: string,
    @Res({ passthrough: true }) res: Response,
  ): WeekReport | string {
    const report = this.reports.getWeekReport(auth.userId, id, Number(n));
    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      return this.reports.renderMarkdown(report);
    }
    return report;
  }
}

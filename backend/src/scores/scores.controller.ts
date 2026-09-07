import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import type { AuthContext } from '../auth/auth.types';
import type { WeekScore } from '../scoring/types';
import { ScoresService, type WeekSnapshotDoc } from './scores.service';
import { str } from '../common/util';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/cycles/:id')
export class ScoresController {
  constructor(private readonly scores: ScoresService) {}

  @Get('score')
  score(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Query('week') week: string,
    @Query('as_of') asOf?: string,
    @Query('include_as_of') includeAsOf?: string,
  ): { score: WeekScore } {
    return {
      score: this.scores.getWeekScore(auth.userId, id, Number(week), {
        as_of_date: asOf,
        include_as_of_date: includeAsOf === 'true' || includeAsOf === '1',
      }),
    };
  }

  @Get('overall')
  overall(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Query('week') week: string,
  ): { score: number; status: string; weeks_scored: number } {
    return this.scores.getOverallScore(auth.userId, id, Number(week));
  }

  @Get('weeks/scores')
  batch(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Query('weeks') weeks: string,
  ): { scores: WeekScore[] } {
    const numbers = str(weeks)
      .split(',')
      .map((w) => Number(w.trim()))
      .filter((w) => Number.isInteger(w));
    return { scores: this.scores.getWeekScoresBatch(auth.userId, id, numbers) };
  }

  @Post('weeks/:n/snapshot')
  @HttpCode(201)
  snapshot(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Param('n') n: string,
  ): { id: string; snapshot: WeekSnapshotDoc } {
    return this.scores.captureSnapshot(auth.userId, id, Number(n));
  }
}

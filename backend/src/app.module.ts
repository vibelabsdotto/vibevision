import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthProviderToken } from './auth/auth.constants';
import { createAuth } from './auth/auth';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { DatabaseModule } from './database/database.module';
import { DatabaseService } from './database/database.service';
import { CyclesController } from './cycles/cycles.controller';
import { CyclesService } from './cycles/cycles.service';
import { HealthController } from './health.controller';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { TacticSchedulesController } from './tactic-schedules/tactic-schedules.controller';
import { TacticSchedulesService } from './tactic-schedules/tactic-schedules.service';
import { TacticsController } from './tactics/tactics.controller';
import { TacticsService } from './tactics/tactics.service';
import { CalendarBlocksController } from './calendar-blocks/calendar-blocks.controller';
import { CalendarBlocksService } from './calendar-blocks/calendar-blocks.service';
import { CycleWeeksController } from './cycle-weeks/cycle-weeks.controller';
import { CycleWeeksService } from './cycle-weeks/cycle-weeks.service';
import { CalendarController } from './calendar/calendar.controller';
import { CalendarService } from './calendar/calendar.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { DailyLogsController } from './daily-logs/daily-logs.controller';
import { DailyLogsService } from './daily-logs/daily-logs.service';
import { EntriesController } from './entries/entries.controller';
import { EntriesService } from './entries/entries.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { GoalsController } from './goals/goals.controller';
import { GoalsService } from './goals/goals.service';
import { LagIndicatorsController } from './lag-indicators/lag-indicators.controller';
import { LagIndicatorsService } from './lag-indicators/lag-indicators.service';
import { MonthlyReviewsController } from './monthly-reviews/monthly-reviews.controller';
import { MonthlyReviewsService } from './monthly-reviews/monthly-reviews.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { ScoresController } from './scores/scores.controller';
import { ScoresService } from './scores/scores.service';
import { SnapshotsController } from './snapshots/snapshots.controller';
import { SnapshotsService } from './snapshots/snapshots.service';
import { TokensController } from './tokens/tokens.controller';
import { WeeklyReviewsController } from './weekly-reviews/weekly-reviews.controller';
import { WeeklyReviewsService } from './weekly-reviews/weekly-reviews.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
  ],
  controllers: [
    HealthController,
    TokensController,
    SettingsController,
    CyclesController,
    CycleWeeksController,
    GoalsController,
    LagIndicatorsController,
    TacticsController,
    TacticSchedulesController,
    CalendarBlocksController,
    EntriesController,
    WeeklyReviewsController,
    MonthlyReviewsController,
    EventsController,
    ScoresController,
    DashboardController,
    ReportsController,
    DailyLogsController,
    SnapshotsController,
    CalendarController,
  ],
  providers: [
    AuthService,
    SettingsService,
    CyclesService,
    CycleWeeksService,
    GoalsService,
    LagIndicatorsService,
    TacticsService,
    TacticSchedulesService,
    CalendarBlocksService,
    EntriesService,
    WeeklyReviewsService,
    MonthlyReviewsService,
    EventsService,
    ScoresService,
    DashboardService,
    ReportsService,
    DailyLogsService,
    SnapshotsService,
    CalendarService,
    {
      provide: AuthProviderToken,
      useFactory: (database: DatabaseService, config: ConfigService) =>
        createAuth(database.db, config),
      inject: [DatabaseService, ConfigService],
    },
    // Global guard-by-default (contract §3): every route requires a session
    // cookie or API token unless marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

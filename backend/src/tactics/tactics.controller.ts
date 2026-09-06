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
import type { Tactic, TacticBody, TacticListQuery } from './tactics.dto';
import { TacticsService } from './tactics.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/tactics')
export class TacticsController {
  constructor(private readonly tactics: TacticsService) {}

  @Get()
  list(
    @Query()
    query: TacticListQuery,
  ): { tactics: Tactic[]; total: number; page: number; limit: number } {
    return this.tactics.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { tactic: Tactic } {
    return { tactic: this.tactics.get(id) };
  }

  @Get(':id/today-state')
  todayState(
    @Param('id') id: string,
    @Query('date') date?: string,
  ): {
    tactic: Tactic;
    execution_style: string;
    today_actual: number;
    today_target: number | null;
  } {
    return this.tactics.todayState(id, date);
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: TacticBody): { tactic: Tactic } {
    return { tactic: this.tactics.create(body ?? {}) };
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: TacticBody,
  ): { tactic: Tactic } {
    return { tactic: this.tactics.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.tactics.remove(id);
  }
}

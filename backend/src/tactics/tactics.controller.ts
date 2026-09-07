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
import type { Tactic, TacticBody, TacticListQuery } from './tactics.dto';
import { TacticsService } from './tactics.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/tactics')
export class TacticsController {
  constructor(private readonly tactics: TacticsService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query()
    query: TacticListQuery,
  ): { tactics: Tactic[]; total: number; page: number; limit: number } {
    return this.tactics.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { tactic: Tactic } {
    return { tactic: this.tactics.get(auth.userId, id) };
  }

  @Get(':id/today-state')
  todayState(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Query('date') date?: string,
  ): {
    tactic: Tactic;
    execution_style: string;
    today_actual: number;
    today_target: number | null;
  } {
    return this.tactics.todayState(auth.userId, id, date);
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: TacticBody,
  ): { tactic: Tactic } {
    return { tactic: this.tactics.create(auth.userId, body ?? {}) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: TacticBody,
  ): { tactic: Tactic } {
    return { tactic: this.tactics.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.tactics.remove(auth.userId, id);
  }
}

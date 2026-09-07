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
import type { Goal, GoalBody, GoalListQuery } from './goals.dto';
import { GoalsService } from './goals.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query()
    query: GoalListQuery,
  ): { goals: Goal[]; total: number; page: number; limit: number } {
    return this.goals.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { goal: Goal } {
    return { goal: this.goals.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: GoalBody,
  ): { goal: Goal } {
    return { goal: this.goals.create(auth.userId, body ?? {}) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: GoalBody,
  ): { goal: Goal } {
    return { goal: this.goals.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.goals.remove(auth.userId, id);
  }
}

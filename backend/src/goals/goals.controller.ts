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
import type { Goal, GoalBody, GoalListQuery } from './goals.dto';
import { GoalsService } from './goals.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(
    @Query()
    query: GoalListQuery,
  ): { goals: Goal[]; total: number; page: number; limit: number } {
    return this.goals.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { goal: Goal } {
    return { goal: this.goals.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: GoalBody): { goal: Goal } {
    return { goal: this.goals.create(body ?? {}) };
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: GoalBody): { goal: Goal } {
    return { goal: this.goals.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.goals.remove(id);
  }
}

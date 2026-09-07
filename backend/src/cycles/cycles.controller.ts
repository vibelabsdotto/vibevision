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
import type { Cycle, CycleBody, CycleListQuery } from './cycles.dto';
import { CyclesService } from './cycles.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/cycles')
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query()
    query: CycleListQuery,
  ): { cycles: Cycle[]; total: number; page: number; limit: number } {
    return this.cycles.list(auth.userId, query ?? {});
  }

  @Get('active')
  active(@Auth() auth: AuthContext): { cycle: Cycle | null } {
    return { cycle: this.cycles.getActive(auth.userId) };
  }

  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id') id: string): { cycle: Cycle } {
    return { cycle: this.cycles.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: CycleBody,
  ): { cycle: Cycle } {
    return { cycle: this.cycles.create(auth.userId, body ?? {}) };
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { cycle: Cycle } {
    return { cycle: this.cycles.activate(auth.userId, id) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: CycleBody,
  ): { cycle: Cycle } {
    return { cycle: this.cycles.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.cycles.remove(auth.userId, id);
  }
}

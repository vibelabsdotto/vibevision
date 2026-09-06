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
import type { Cycle, CycleBody, CycleListQuery } from './cycles.dto';
import { CyclesService } from './cycles.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/cycles')
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get()
  list(
    @Query()
    query: CycleListQuery,
  ): { cycles: Cycle[]; total: number; page: number; limit: number } {
    return this.cycles.list(query ?? {});
  }

  @Get('active')
  active(): { cycle: Cycle | null } {
    return { cycle: this.cycles.getActive() };
  }

  @Get(':id')
  get(@Param('id') id: string): { cycle: Cycle } {
    return { cycle: this.cycles.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CycleBody): { cycle: Cycle } {
    return { cycle: this.cycles.create(body ?? {}) };
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id') id: string): { cycle: Cycle } {
    return { cycle: this.cycles.activate(id) };
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: CycleBody): { cycle: Cycle } {
    return { cycle: this.cycles.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.cycles.remove(id);
  }
}

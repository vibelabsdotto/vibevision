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
import type {
  TacticEntry,
  TacticEntryBody,
  TacticEntryListQuery,
} from './entries.dto';
import { EntriesService } from './entries.service';
import { str } from '../common/util';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/entries')
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get()
  list(
    @Query()
    query: TacticEntryListQuery,
  ): {
    tactic_entries: TacticEntry[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.entries.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { tactic_entry: TacticEntry } {
    return { tactic_entry: this.entries.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: TacticEntryBody): { tactic_entry: TacticEntry } {
    return { tactic_entry: this.entries.create(body ?? {}) };
  }

  /** Validated single-entry logging (stepper/CLI path) — same rules as create. */
  @Post('log')
  @HttpCode(201)
  log(@Body() body: TacticEntryBody): { tactic_entry: TacticEntry } {
    return { tactic_entry: this.entries.create(body ?? {}) };
  }

  /** Undo the latest entry for a tactic+date (stepper path). */
  @Post('undo')
  @HttpCode(200)
  undo(@Body() body: { tactic_id?: unknown; date?: unknown }): {
    undone: string | null;
  } {
    return this.entries.undo(str(body?.tactic_id), str(body?.date));
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: TacticEntryBody,
  ): { tactic_entry: TacticEntry } {
    return { tactic_entry: this.entries.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.entries.remove(id);
  }
}

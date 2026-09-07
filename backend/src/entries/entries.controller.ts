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
    @Auth() auth: AuthContext,
    @Query()
    query: TacticEntryListQuery,
  ): {
    tactic_entries: TacticEntry[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.entries.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { tactic_entry: TacticEntry } {
    return { tactic_entry: this.entries.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: TacticEntryBody,
  ): { tactic_entry: TacticEntry } {
    return { tactic_entry: this.entries.create(auth.userId, body ?? {}) };
  }

  /** Validated single-entry logging (stepper/CLI path) — same rules as create. */
  @Post('log')
  @HttpCode(201)
  log(
    @Auth() auth: AuthContext,
    @Body() body: TacticEntryBody,
  ): { tactic_entry: TacticEntry } {
    return { tactic_entry: this.entries.create(auth.userId, body ?? {}) };
  }

  /** Undo the latest entry for a tactic+date (stepper path). */
  @Post('undo')
  @HttpCode(200)
  undo(
    @Auth() auth: AuthContext,
    @Body() body: { tactic_id?: unknown; date?: unknown },
  ): {
    undone: string | null;
  } {
    return this.entries.undo(auth.userId, str(body?.tactic_id), str(body?.date));
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: TacticEntryBody,
  ): { tactic_entry: TacticEntry } {
    return { tactic_entry: this.entries.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.entries.remove(auth.userId, id);
  }
}

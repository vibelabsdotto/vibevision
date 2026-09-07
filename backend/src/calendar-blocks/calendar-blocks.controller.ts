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
  CalendarBlock,
  CalendarBlockBody,
  CalendarBlockListQuery,
} from './calendar-blocks.dto';
import { CalendarBlocksService } from './calendar-blocks.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/calendar-blocks')
export class CalendarBlocksController {
  constructor(private readonly blocks: CalendarBlocksService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query()
    query: CalendarBlockListQuery,
  ): {
    calendar_blocks: CalendarBlock[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.blocks.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { calendar_block: CalendarBlock } {
    return { calendar_block: this.blocks.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: CalendarBlockBody,
  ): { calendar_block: CalendarBlock } {
    return { calendar_block: this.blocks.create(auth.userId, body ?? {}) };
  }

  @Post('move')
  @HttpCode(200)
  move(
    @Auth() auth: AuthContext,
    @Body() body: Record<string, unknown>,
  ): {
    action: 'moved';
    source_block_id: string;
    block: CalendarBlock;
  } {
    return this.blocks.move(auth.userId, body ?? {});
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: CalendarBlockBody,
  ): { calendar_block: CalendarBlock } {
    return { calendar_block: this.blocks.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.blocks.remove(auth.userId, id);
  }
}

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
    @Query()
    query: CalendarBlockListQuery,
  ): {
    calendar_blocks: CalendarBlock[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.blocks.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { calendar_block: CalendarBlock } {
    return { calendar_block: this.blocks.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CalendarBlockBody): { calendar_block: CalendarBlock } {
    return { calendar_block: this.blocks.create(body ?? {}) };
  }

  @Post('move')
  @HttpCode(200)
  move(@Body() body: Record<string, unknown>): {
    action: 'moved';
    source_block_id: string;
    block: CalendarBlock;
  } {
    return this.blocks.move(body ?? {});
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: CalendarBlockBody,
  ): { calendar_block: CalendarBlock } {
    return { calendar_block: this.blocks.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.blocks.remove(id);
  }
}

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
  Snapshot,
  SnapshotBody,
  SnapshotListQuery,
} from './snapshots.dto';
import { SnapshotsService } from './snapshots.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/snapshots')
export class SnapshotsController {
  constructor(private readonly snapshots: SnapshotsService) {}

  @Get()
  list(
    @Query()
    query: SnapshotListQuery,
  ): { snapshots: Snapshot[]; total: number; page: number; limit: number } {
    return this.snapshots.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { snapshot: Snapshot } {
    return { snapshot: this.snapshots.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: SnapshotBody): { snapshot: Snapshot } {
    return { snapshot: this.snapshots.create(body ?? {}) };
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: SnapshotBody,
  ): { snapshot: Snapshot } {
    return { snapshot: this.snapshots.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.snapshots.remove(id);
  }
}

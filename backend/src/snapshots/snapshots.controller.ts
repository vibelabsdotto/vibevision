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
    @Auth() auth: AuthContext,
    @Query()
    query: SnapshotListQuery,
  ): { snapshots: Snapshot[]; total: number; page: number; limit: number } {
    return this.snapshots.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { snapshot: Snapshot } {
    return { snapshot: this.snapshots.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: SnapshotBody,
  ): { snapshot: Snapshot } {
    return { snapshot: this.snapshots.create(auth.userId, body ?? {}) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: SnapshotBody,
  ): { snapshot: Snapshot } {
    return { snapshot: this.snapshots.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.snapshots.remove(auth.userId, id);
  }
}

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
  LagIndicator,
  LagIndicatorBody,
  LagIndicatorListQuery,
} from './lag-indicators.dto';
import { LagIndicatorsService } from './lag-indicators.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/lag-indicators')
export class LagIndicatorsController {
  constructor(private readonly lags: LagIndicatorsService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query()
    query: LagIndicatorListQuery,
  ): {
    lag_indicators: LagIndicator[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.lags.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { lag_indicator: LagIndicator } {
    return { lag_indicator: this.lags.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: LagIndicatorBody,
  ): { lag_indicator: LagIndicator } {
    return { lag_indicator: this.lags.create(auth.userId, body ?? {}) };
  }

  @Put(':id/achieve')
  @HttpCode(200)
  achieve(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { lag_indicator: LagIndicator } {
    return { lag_indicator: this.lags.achieve(auth.userId, id) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: LagIndicatorBody,
  ): { lag_indicator: LagIndicator } {
    return { lag_indicator: this.lags.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.lags.remove(auth.userId, id);
  }
}

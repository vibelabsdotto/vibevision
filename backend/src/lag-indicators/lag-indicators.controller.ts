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
    @Query()
    query: LagIndicatorListQuery,
  ): {
    lag_indicators: LagIndicator[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.lags.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { lag_indicator: LagIndicator } {
    return { lag_indicator: this.lags.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: LagIndicatorBody): { lag_indicator: LagIndicator } {
    return { lag_indicator: this.lags.create(body ?? {}) };
  }

  @Put(':id/achieve')
  @HttpCode(200)
  achieve(@Param('id') id: string): { lag_indicator: LagIndicator } {
    return { lag_indicator: this.lags.achieve(id) };
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: LagIndicatorBody,
  ): { lag_indicator: LagIndicator } {
    return { lag_indicator: this.lags.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.lags.remove(id);
  }
}

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
  MonthlyReview,
  MonthlyReviewBody,
  MonthlyReviewListQuery,
} from './monthly-reviews.service';
import { MonthlyReviewsService } from './monthly-reviews.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/monthly-reviews')
export class MonthlyReviewsController {
  constructor(private readonly reviews: MonthlyReviewsService) {}

  @Get()
  list(
    @Query()
    query: MonthlyReviewListQuery,
  ): {
    monthly_reviews: MonthlyReview[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.reviews.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { monthly_review: MonthlyReview } {
    return { monthly_review: this.reviews.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: MonthlyReviewBody): { monthly_review: MonthlyReview } {
    return { monthly_review: this.reviews.create(body ?? {}) };
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: MonthlyReviewBody,
  ): { monthly_review: MonthlyReview } {
    return { monthly_review: this.reviews.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.reviews.remove(id);
  }
}

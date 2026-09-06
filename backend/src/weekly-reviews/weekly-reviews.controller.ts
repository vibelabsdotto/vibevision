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
  WeeklyReview,
  WeeklyReviewBody,
  WeeklyReviewListQuery,
} from './weekly-reviews.service';
import { WeeklyReviewsService } from './weekly-reviews.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/weekly-reviews')
export class WeeklyReviewsController {
  constructor(private readonly reviews: WeeklyReviewsService) {}

  @Get()
  list(
    @Query()
    query: WeeklyReviewListQuery,
  ): {
    weekly_reviews: WeeklyReview[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.reviews.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { weekly_review: WeeklyReview } {
    return { weekly_review: this.reviews.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: WeeklyReviewBody): { weekly_review: WeeklyReview } {
    return { weekly_review: this.reviews.create(body ?? {}) };
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: WeeklyReviewBody,
  ): { weekly_review: WeeklyReview } {
    return { weekly_review: this.reviews.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.reviews.remove(id);
  }
}

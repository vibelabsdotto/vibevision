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
    @Auth() auth: AuthContext,
    @Query()
    query: WeeklyReviewListQuery,
  ): {
    weekly_reviews: WeeklyReview[];
    total: number;
    page: number;
    limit: number;
  } {
    return this.reviews.list(auth.userId, query ?? {});
  }

  @Get(':id')
  get(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { weekly_review: WeeklyReview } {
    return { weekly_review: this.reviews.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: WeeklyReviewBody,
  ): { weekly_review: WeeklyReview } {
    return { weekly_review: this.reviews.create(auth.userId, body ?? {}) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: WeeklyReviewBody,
  ): { weekly_review: WeeklyReview } {
    return { weekly_review: this.reviews.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.reviews.remove(auth.userId, id);
  }
}

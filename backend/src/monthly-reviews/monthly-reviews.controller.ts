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
    @Auth() auth: AuthContext,
    @Query()
    query: MonthlyReviewListQuery,
  ): {
    monthly_reviews: MonthlyReview[];
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
  ): { monthly_review: MonthlyReview } {
    return { monthly_review: this.reviews.get(auth.userId, id) };
  }

  @Post()
  @HttpCode(201)
  create(
    @Auth() auth: AuthContext,
    @Body() body: MonthlyReviewBody,
  ): { monthly_review: MonthlyReview } {
    return { monthly_review: this.reviews.create(auth.userId, body ?? {}) };
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: MonthlyReviewBody,
  ): { monthly_review: MonthlyReview } {
    return { monthly_review: this.reviews.update(auth.userId, id, body ?? {}) };
  }

  @Delete(':id')
  remove(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
  ): { ok: boolean } {
    return this.reviews.remove(auth.userId, id);
  }
}

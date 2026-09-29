import type { ReviewRating } from '@prisma/client';
import { IsIn } from 'class-validator';

export const REVIEW_RATINGS = ['Again', 'Hard', 'Good', 'Easy'] as const;

export class ReviewDto {
  @IsIn(REVIEW_RATINGS)
  rating: ReviewRating;
}

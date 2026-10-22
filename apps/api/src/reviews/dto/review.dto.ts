import { IsIn } from 'class-validator';
import type { Grade } from '../../scheduling/scheduler.service.js';

export const REVIEW_RATINGS = ['Again', 'Hard', 'Good', 'Easy'] as const;

export class ReviewDto {
  @IsIn(REVIEW_RATINGS)
  rating: Grade;
}

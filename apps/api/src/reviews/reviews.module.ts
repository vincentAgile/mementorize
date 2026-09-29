import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [AuthModule, SchedulingModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}

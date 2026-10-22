import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { LearningController } from './learning.controller.js';
import { LearningService } from './learning.service.js';

@Module({
  imports: [AuthModule, SchedulingModule],
  controllers: [LearningController],
  providers: [LearningService],
})
export class LearningModule {}

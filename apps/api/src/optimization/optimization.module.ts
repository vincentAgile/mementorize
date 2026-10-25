import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OptimizationController } from './optimization.controller.js';
import { OptimizationService } from './optimization.service.js';

/** MEM-76: the optimization of the FSRS weights on the user's history. */
@Module({
  imports: [AuthModule], // JwtAuthGuard
  controllers: [OptimizationController],
  providers: [OptimizationService],
})
export class OptimizationModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';

@Module({
  imports: [AuthModule], // for JwtAuthGuard
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}

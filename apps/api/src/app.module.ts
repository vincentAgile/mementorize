import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ItemsModule } from './items/items.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, ItemsModule, ReviewsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

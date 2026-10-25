import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.validation.js';
import { HealthController } from './health/health.controller.js';
import { PreferencesModule } from './preferences/preferences.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { ItemsModule } from './items/items.module.js';
import { LearningModule } from './learning/learning.module.js';
import { OptimizationModule } from './optimization/optimization.module.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    ItemsModule,
    ReviewsModule,
    LearningModule,
    // Scheduled tasks (@Cron), e.g. the e-mail reminders.
    ScheduleModule.forRoot(),
    RemindersModule,
    PreferencesModule,
    ProfileModule,
    OptimizationModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}

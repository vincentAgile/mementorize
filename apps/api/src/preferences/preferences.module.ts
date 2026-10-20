import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PreferencesController } from './preferences.controller.js';
import { PreferencesService } from './preferences.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PreferencesController],
  providers: [PreferencesService],
})
export class PreferencesModule {}
